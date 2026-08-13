"""Local, $0-cost drawing dimension extraction using Moondream2, running fully
offline. Tries GPU first (CUDA, then Apple MPS), falls back to CPU automatically.
No API key, no per-call cost, no data leaves this machine.

Same output contract as drawing_extraction_service.extract_dimensions() so the
router can swap between them via settings.extraction_backend without any other
code changes.

First run downloads the model weights from Hugging Face (a few GB, one-time,
free) and caches them locally under ~/.cache/huggingface.
"""
import json
import re

import torch
import fitz
from PIL import Image
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "vikhyatk/moondream2"
MODEL_REVISION = "2024-08-26"  # pin a revision so behavior doesn't shift under you

_model = None
_tokenizer = None
_device = None


def _pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():  # Apple Silicon
        return "mps"
    return "cpu"


def _load_model():
    """Lazy singleton load -- avoids reloading weights on every extraction call.
    Loaded in float32 on CPU (float16 isn't well supported on CPU), float16 on
    GPU/MPS to save memory and run faster."""
    global _model, _tokenizer, _device
    if _model is not None:
        return _model, _tokenizer, _device

    _device = _pick_device()
    dtype = torch.float16 if _device in ("cuda", "mps") else torch.float32

    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        trust_remote_code=True,
        torch_dtype=dtype,
    ).to(_device)
    _model.eval()
    return _model, _tokenizer, _device


EXTRACTION_PROMPT = """Read this construction drawing carefully. Report ONLY what you can \
actually see or measure -- do not guess.

Respond with ONLY a JSON object, no other text, no markdown fences, in this exact shape:
{
  "scale_found": true or false,
  "scale_ratio": number or null,
  "wall_length_ft": number or null,
  "floor_area_sqft": number or null,
  "roof_area_sqft": number or null,
  "opening_sqft": number or null,
  "rooms": [],
  "confidence": {"wall_length_ft": "high", "floor_area_sqft": "low", "roof_area_sqft": "low", "opening_sqft": "low"},
  "notes": "brief notes on what was/wasn't legible"
}

If you cannot find an explicit scale marking, set scale_found to false and scale_ratio to null. \
Do not invent a scale. If a field can't be determined, use null and mark its confidence as "low"."""


def _extract_json(text: str) -> dict:
    """Small open models are less reliable than frontier APIs about respecting
    "JSON only" instructions -- this strips markdown fences and grabs the first
    {...} block rather than assuming the whole response is clean JSON."""
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise RuntimeError(f"Local model did not return JSON. Raw output: {text[:500]}")
    return json.loads(match.group(0))


def _load_image(file_path: str) -> Image.Image:
    """Returns a PIL image for either a direct image file or the first page
    of a PDF, rendered at a high enough resolution to keep dimension text/
    labels legible. Multi-page drawing sets are common (floor plan, elevation,
    roof plan on separate pages) -- for now this only reads page 1, since
    picking the right page automatically isn't reliable; if the wrong page
    gets used often in practice, worth adding a page-selection step instead
    of silently guessing."""
    if file_path.lower().endswith(".pdf"):
        doc = fitz.open(file_path)
        if doc.page_count == 0:
            raise RuntimeError("PDF has no pages")
        page = doc[0]
        # Render at 2x zoom (~144 DPI) -- dimension labels on architectural
        # drawings are often small; too low a resolution and the model can't
        # read them at all.
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
        return image
    return Image.open(file_path).convert("RGB")


def extract_dimensions(file_path: str) -> dict:
    """Same contract as before. Now accepts PDFs -- the first page is
    rendered to an image and passed through the same extraction path as a
    native image file."""
    model, tokenizer, device = _load_model()

    try:
        image = _load_image(file_path)
    except Exception as e:
        raise RuntimeError(f"Could not read drawing file: {e}") from e

    with torch.no_grad():
        encoded_image = model.encode_image(image)
        answer = model.answer_question(encoded_image, EXTRACTION_PROMPT, tokenizer)

    try:
        return _extract_json(answer)
    except (json.JSONDecodeError, RuntimeError) as e:
        raise RuntimeError(f"Local extraction failed to parse output: {e}") from e

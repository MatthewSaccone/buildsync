from app.models.pin import Pin
from app.schemas.schemas import PinOut


def serialize_pin(pin: Pin) -> PinOut:
    return PinOut.model_validate(pin)

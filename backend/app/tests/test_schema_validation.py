import unittest

from pydantic import ValidationError

from app.schemas.schemas import (
    DimensionConfirm,
    MessageCreate,
    PasswordChange,
    PasswordResetConfirm,
    PinCreate,
    PinMaterialCreate,
    ProjectCreate,
    ScheduledJobCreate,
    TaskCreate,
    TaskMaterialCreate,
    UserCreate,
    UserUpdate,
)


class SchemaValidationTests(unittest.TestCase):
    def test_password_policy_applies_to_signup_change_and_reset(self):
        for factory in (
            lambda: UserCreate(email="test@example.com", password="short", full_name="Test User"),
            lambda: PasswordChange(current_password="CurrentPassword1", new_password="short"),
            lambda: PasswordResetConfirm(token="token", new_password="short"),
        ):
            with self.subTest(factory=factory):
                with self.assertRaises(ValidationError):
                    factory()

    def test_password_rejects_bcrypt_unsafe_utf8_length(self):
        with self.assertRaises(ValidationError):
            UserCreate(
                email="test@example.com",
                password="é" * 40 + "A1",
                full_name="Test User",
            )

    def test_blank_strings_are_rejected(self):
        with self.assertRaises(ValidationError):
            UserCreate(email="test@example.com", password="ValidPassword1", full_name="   ")

        with self.assertRaises(ValidationError):
            ProjectCreate(name="   ")

        with self.assertRaises(ValidationError):
            MessageCreate(body="\t\n")

    def test_user_cannot_update_role(self):
        payload = UserUpdate.model_validate({"full_name": "Test User", "role": "admin"})
        self.assertFalse(hasattr(payload, "role"))

    def test_pin_coordinates_and_ids_are_bounded(self):
        with self.assertRaises(ValidationError):
            PinCreate(sheet_id=1, x=-0.01, y=0.5, title="Pin")

        with self.assertRaises(ValidationError):
            PinCreate(sheet_id=1, x=0.5, y=1.01, title="Pin")

        with self.assertRaises(ValidationError):
            PinCreate(sheet_id=0, x=0.5, y=0.5, title="Pin")

    def test_quantities_must_be_positive(self):
        for factory in (
            lambda: PinMaterialCreate(material_variant_id=1, quantity=0),
            lambda: TaskMaterialCreate(material_variant_id=1, quantity=-1),
        ):
            with self.subTest(factory=factory):
                with self.assertRaises(ValidationError):
                    factory()

    def test_related_pin_list_is_bounded_and_unique(self):
        with self.assertRaises(ValidationError):
            TaskCreate(title="Task", related_pin_ids=list(range(1, 102)))

        with self.assertRaises(ValidationError):
            TaskCreate(title="Task", related_pin_ids=[1, 1])

    def test_estimate_dimensions_and_waste_are_bounded(self):
        with self.assertRaises(ValidationError):
            DimensionConfirm(wall_length_ft=-1)

        with self.assertRaises(ValidationError):
            DimensionConfirm(wall_length_ft=10, opening_sqft=81)

        with self.assertRaises(ValidationError):
            DimensionConfirm(
                wall_length_ft=10,
                waste_factor_overrides={"drywall": 1.01},
            )

    def test_schedule_update_cannot_reverse_times(self):
        with self.assertRaises(ValidationError):
            from datetime import datetime

            ScheduledJobCreate(
                title="Job",
                start_time=datetime(2026, 1, 1, 10),
                end_time=datetime(2026, 1, 1, 9),
            )


if __name__ == "__main__":
    unittest.main()

"""Custom exceptions for HedgeBuddy library."""


class HedgeBuddyError(Exception):
    """Base exception for all HedgeBuddy errors."""

    pass


class VariableNotFoundError(HedgeBuddyError):
    """Raised when a requested variable is not found in vars.json."""

    def __init__(self, variable_name: str):
        self.variable_name = variable_name
        super().__init__(
            f"Variable '{variable_name}' not found in HedgeBuddy storage. "
            f"Please add it using the HedgeBuddy app."
        )


class StorageNotFoundError(HedgeBuddyError):
    """Raised when the vars.json file doesn't exist."""

    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        super().__init__(
            f"HedgeBuddy storage file not found at: {storage_path}\n"
            f"Please install and run the HedgeBuddy app to create your first variable."
        )


class StorageCorruptedError(HedgeBuddyError):
    """Raised when vars.json exists but contains invalid JSON."""

    def __init__(self, storage_path: str, reason: str):
        self.storage_path = storage_path
        self.reason = reason
        super().__init__(
            f"HedgeBuddy storage file is corrupted: {storage_path}\n"
            f"Reason: {reason}\n"
            f"Please use the HedgeBuddy app to fix or recreate your variables."
        )

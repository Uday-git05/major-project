class InferenceError(RuntimeError):
    """Base error for a failed inference contract."""


class ArtifactCompatibilityError(InferenceError):
    """A frozen artifact is incompatible with the declared deployment contract."""


class FeatureContractError(InferenceError):
    """An input feature vector violates the frozen 27-feature contract."""

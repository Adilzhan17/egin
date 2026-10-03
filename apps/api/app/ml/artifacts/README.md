Artifacts live in the persistent `/workspace/artifacts` mount, not in the source tree:
`crop-suitability.joblib`, `model-metadata.json`, `training_data.csv`, `evaluation.json`.
CORE bootstrap trains missing artifacts. See docs/ML.md for provenance and limitations.

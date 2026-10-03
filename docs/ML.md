# Crop suitability

The deployed artifact is a trained scikit-learn classifier, not a threshold rule. It ranks six crops and returns three candidates. **It is an experimental demonstration model trained on synthetic profiles, not an agronomically validated recommendation.** Weather risk flags are transparent rules and are labelled separately.

## Dataset review (2026-10-04)

- FAO/IIASA [GAEZ](https://www.fao.org/gaez/gaezv4/en) provides modeled suitability and attainable yields. These are model outputs, not labelled Kazakhstan field observations. They need harmonization by management/irrigation/scenario before being suitable targets for this application; they were not relabelled as measured training data.
- [EuroCrops](https://github.com/maja601/EuroCrops), CC-BY-SA-4.0, contains European crop declarations. Crop choice is not evidence of agronomic suitability and does not supply Kazakhstan labels. Not imported as suitability ground truth.
- [Kazakhstan Bureau of National Statistics](https://stat.gov.kz/en/industries/business-statistics/stat-forrest-village-hunt-fish/publications/301885/?sphrase_id=144024) publishes crop harvest statistics. Regional aggregates cannot be joined to individual field soil samples as if they were measured field labels. No compatible field dataset was verified.
- Reposted generic crop-recommendation CSVs lacked verified observation provenance for this use. No unsupported accuracy claim was made.

The fallback dataset is therefore explicitly `DEMO_SYNTHETIC`: 3,900 reproducible rows, six overlapping Gaussian profiles, seed 42, clipping and stratified 75/25 split. Generated data only: CC0-1.0. Exact assumptions are in the training script and metadata. No measured Kazakhstan accuracy is claimed.

## Pipeline

`apps/api/app/ml/` contains `training`, `features`, `inference`, `evaluation` and artifact documentation. Run `docker compose exec core python /workspace/scripts/train_models.py`.

Training compares ExtraTrees, RandomForest and HistGradientBoosting on the same validation split. Selection uses macro F1; the split is validation, not an independent test set. ExtraTrees won: balanced accuracy 0.4911, macro F1 0.4633. RandomForest: 0.4767 / 0.4618. HistGradientBoosting: 0.4613 / 0.4517. These values describe only the synthetic validation set.

Artifacts persist in `artifacts/crop-suitability.joblib`, `model-metadata.json`, `training_data.csv`, `evaluation.json`. Metadata records feature schema, versions, SHA-256, confusion matrix and permutation importance. The artifact is loaded on CORE startup; missing artifacts are trained automatically.

The feature builder collects centroid latitude/longitude, month, area, forecast ET₀, seasonal temperature/precipitation, pH, SOC, clay, sand, silt, CEC and bulk density. The current model uses **five** validated input columns: pH, May–August temperature and precipitation, clay and SOC. Extra observed covariates remain in the analysis snapshot; they are not assigned invented training effects. Missing required provider values produce `insufficient_data`, never synthetic imputation.

## Replacing the dataset

Set `TRAINING_CSV=/workspace/data/training.csv` for the training command and provide adjacent `training.json` with `source_url`, `license`, `collected_at`, and ordered `features`. CSV has these numeric columns and `crop`. All inputs must be finite and at least three crop labels must be present. Choose feature names supported by the feature builder. The trained feature schema drives field inference without rewriting the application. External data is labelled `EXTERNAL_UNVALIDATED` until spatial, seasonal and agronomic validation is performed.

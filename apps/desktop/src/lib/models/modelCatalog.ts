import type { ProcessingFeatureKey } from "@/domain/settings/types";

// The model catalog is the single source of truth that maps each downloadable
// model to the feature it powers. It is framework-free (no React, no Tauri) so
// it can be shared by the settings UI, the install hook, and the Builder gating.
//
// A "feature" is a capability (e.g. Text Detector); a "model" is one downloadable
// implementation of it. Most features have a single model; Text Detector has
// several. The `modelId` doubles as the backend model id ($APP_DATA/models/<id>)
// and the value persisted in settings.

export type ModelCatalogEntry = {
  /** Backend model id and persisted identifier. */
  modelId: string;
  feature: ProcessingFeatureKey;
  /** Display name, e.g. "DBNet-ResNet34". */
  label: string;
  /** Approximate download size, e.g. "~85 MB". */
  size: string;
  description: string;
  /** File names for multi-file packages (Florence-2); single-file models omit it. */
  files?: readonly string[];
};

export type FeatureMeta = {
  key: ProcessingFeatureKey;
  /** Feature name, e.g. "Text Detector". */
  name: string;
  /** What the feature does, shown next to its enable switch. */
  description: string;
  /** True when the feature needs no downloadable model (runs built-in logic). */
  modelFree?: boolean;
};

// Florence-2 ships as five files downloaded sequentially, in this order. Used by
// the install UI to show which file is in flight ("1 of 5").
export const FLORENCE2_FILES = [
  "vision_encoder.onnx",
  "embed_tokens.onnx",
  "encoder_model.onnx",
  "decoder_model_merged.onnx",
  "tokenizer.json",
] as const;

export const FEATURES: FeatureMeta[] = [
  {
    key: "removeBackground",
    name: "Remove Background",
    description: "Removes the image background from cuts.",
  },
  {
    key: "upscale",
    name: "Upscale (4×)",
    description: "Increases cut resolution 4×.",
  },
  {
    key: "autoDetect",
    name: "Auto-detect Components",
    description: "Proposes crop regions automatically from a UI screenshot.",
  },
  {
    key: "textDetection",
    name: "Text Detector",
    description: "Detects whether a cut contains text.",
  },
  {
    key: "removeElement",
    name: "Remove Element",
    description: "Removes a painted selection from a cut via inpainting.",
  },
  {
    key: "colorDetector",
    name: "Color Detector",
    description: "Extracts all colors from a cut. No model required — runs built-in.",
    modelFree: true,
  },
  {
    key: "fontDetection",
    name: "Font Detector",
    description: "Identifies the Google Font family used in a cut.",
  },
];

export const FEATURE_KEYS: ProcessingFeatureKey[] = FEATURES.map((f) => f.key);

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    modelId: "birefnet",
    feature: "removeBackground",
    label: "BiRefNet",
    size: "~220 MB",
    description: "High-quality background removal.",
  },
  {
    modelId: "real-esrgan",
    feature: "upscale",
    label: "Real-ESRGAN",
    size: "~5 MB",
    description: "4× super-resolution (realesr-general-x4v3).",
  },
  {
    modelId: "omniparser-icon-detect",
    feature: "autoDetect",
    label: "OmniParser (icon detect)",
    size: "~58 MB",
    description: "Detects UI icons and elements as crop regions. Fast; built for screenshots.",
  },
  {
    modelId: "florence2",
    feature: "autoDetect",
    label: "Florence-2",
    size: "~1.2 GB",
    description: "Dense region captioning for crop proposals.",
    files: FLORENCE2_FILES,
  },
  {
    modelId: "dbnet-mobilenet-v3-large",
    feature: "textDetection",
    label: "DBNet-MobileNetV3",
    size: "~15 MB",
    description: "Lightest, fastest text detector.",
  },
  {
    modelId: "dbnet-resnet34",
    feature: "textDetection",
    label: "DBNet-ResNet34",
    size: "~85 MB",
    description: "Balanced DBNet text detector.",
  },
  {
    modelId: "dbnet-resnet50",
    feature: "textDetection",
    label: "DBNet-ResNet50",
    size: "~96 MB",
    description: "Most accurate DBNet text detector.",
  },
  {
    modelId: "craft",
    feature: "textDetection",
    label: "CRAFT",
    size: "~80 MB",
    description: "Character-region text detector.",
  },
  {
    modelId: "lama",
    feature: "removeElement",
    label: "LaMa",
    size: "~208 MB",
    description: "Inpainting to erase a painted selection.",
  },
  {
    modelId: "font-classify",
    feature: "fontDetection",
    label: "font-classify (EfficientNet-B3)",
    size: "~64 MB",
    description: "Identifies Google Font families from images. ~3,000 fonts.",
    files: ["model.onnx", "fonts_mapping.yaml", "model_config.yaml"],
  },
];

export function featureMeta(key: ProcessingFeatureKey): FeatureMeta {
  const meta = FEATURES.find((f) => f.key === key);
  if (!meta) throw new Error(`unknown feature: ${key}`);
  return meta;
}

export function modelsForFeature(key: ProcessingFeatureKey): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((m) => m.feature === key);
}

export function catalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.modelId === modelId);
}

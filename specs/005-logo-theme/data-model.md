# Data Model: S06 Tema bağımsız logo kimliği

## FeatureContract

LogoAsset: one canonical identity; alt CaseBridge; intrinsic aspect ratio preserved; theme preference continues casebridge-theme.

Logo source remains byte-identical opaque 374×108 PNG; source white matte and previous wrapper white plate are distinct. Wrapper has no plate/padding. CSS multiply on light surfaces and invert+hue-rotate+screen on dark surfaces make the matte blend into the actual background while retaining raster geometry. This is transparent appearance in the UI, not a newly generated alpha PNG or a redrawn SVG; original two-ink mark has no separate intentional white painted element. Same dimensions/source in both modes; actual background corner pixels and dominant ink visibility must be checked.

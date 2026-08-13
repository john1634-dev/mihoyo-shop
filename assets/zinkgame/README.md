# ZinkGame Logo Template

Phase 9 logo detection uses **template matching** against an authorized logo reference image.

## Required file

Place an authorized logo crop at:

```text
assets/zinkgame/zinkgame-logo-template.png
```

## Important

- Do **not** commit supplier product screenshots as the template unless you have rights to use them.
- The detector will **not** run removal without this file.
- Without the template, detection returns:

  ```text
  No logo template available
  ```

## Recommended template

- PNG with transparent or solid background cropped tightly to the ZinkGame logo mark.
- Include the full logo (graphic + wordmark) as it appears on supplier product images.
- Typical size: 100–300 px wide; the detector scales across 0.5×–2× automatically.

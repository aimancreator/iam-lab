# Visual assets

The picture summaries are static teaching examples, not live AWS results. Their captions and text transcripts remain readable without the images. Each diagram has landscape and portrait variants for desktop and phone screens, with words and symbols rather than color alone.

- `iam-overview.png`: original overview illustration generated with the built-in image-generation tool; copied into this project, not loaded from an external URL.
- `*.svg`, `*-mobile.svg`: precise code-native diagrams, generated from the reviewed explanations in `../../visual-summaries.js` using `../../scripts/build-visuals.cjs`. They are not AI-generated policy diagrams. Run `node iam-lab/scripts/build-visuals.cjs` from the workspace root to regenerate them after changing the topic data.

The supplied upstream repository and its original files are not modified.

## Illustration prompt

Built-in image-generation tool, 4 October 2026. No CLI/API fallback was used.

Use case: scientific-educational. Asset type: wide overview illustration for an existing beginner AWS IAM learning website. Create a friendly, very clear, wordless educational illustration in three left-to-right scenes on a warm off-white background. Scene 1: a person with a simple identity badge, representing who is making a request. Scene 2: a small team beside one shared permissions checklist, representing users sharing permissions through a group. Scene 3: two clearly distinct file-storage containers: an accessible training folder with a green check, and a closed private folder with a red stop symbol, representing limited access. Use a calm editorial illustration style, clean shapes, dark teal outlines, sage green, warm cream, and restrained orange accents matching a minimal learning app. Keep each scene spacious and visually distinct, connected only by subtle direction arrows. Make objects large and recognizable; avoid clutter, dense dashboards, tiny detail, jargon, characters holding keys, and complex architecture. No text, no letters, no numbers, no AWS logos, no branding, no watermark. This is a conceptual learning illustration, not an AWS console screenshot. Aim for a panoramic composition, approximately 2.4:1, with generous safe margins. Render the finished illustration, not a website mockup.

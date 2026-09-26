---
name: press-images
description: How to find, verify, and upload a representative image for a Publisher article using official press or product assets. Use before uploading any article image.
---

# Press images

Unless site guidance says otherwise, the representative image comes from an
official press or product resource. Take the first image that passes the
rejection list below; otherwise continue down the order.

1. The announcement page of the subject (company newsroom or blog post):
   read `og:image`/`twitter:image` in the page's `<head>`; prefer a
   `1600×900` or larger variant (many CDNs accept
   `?w=1600&h=900&fit=crop`).
2. The product page for the product named in the headline.
3. The company's press kit or brand assets page.

Reject an image when:

- it carries a caption, demo text, or UI screenshot unrelated to the story
  (the 2026-09-19 ChatGPT Pro card showing "deadlock source and fix in C++"
  is the canonical example);
- it is narrower than 1200 px, shorter than 630 px, or its aspect ratio
  falls outside 1.4–2.0 (the desk's `image.size`/`image.aspect` checks);
- it belongs to a third party (stock, social-media avatar, another outlet).

Record the source URL of the image in the approval note. Download with
`curl -sL -A "Mozilla/5.0" <url> -o <file>` and check `file <file>` for the
real type. Verify dimensions locally before uploading — `sips -g pixelWidth
-g pixelHeight <file>` on macOS, `identify <file>` elsewhere — then
`publisher media upload --site <id> --file <file> --mime-type <type> --non-interactive --json`
(returns `MEDIA_APPROVED`). Only when you deliberately uploaded with
`--pending` (`MEDIA_UPLOADED`) run
`publisher media approve --site <id> --media <media-id> --non-interactive --json`.
Use the widest `media.variants[].publicPath` as `imageUrl`. Keep the
downloaded file — the desk-reviewer agent reads it directly.

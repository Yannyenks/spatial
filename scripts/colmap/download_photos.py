#!/usr/bin/env python3
"""Downloads a space's real photos (presigned URLs fetched by the workflow)
into a local directory, named by asset id so the COLMAP output can be
traced back to the exact asset each pose came from — real provenance
(execution-plan §29), not an opaque numbered list.
"""
import json
import sys
import urllib.request


def main() -> None:
    photos_json_path, out_dir = sys.argv[1], sys.argv[2]
    with open(photos_json_path, encoding="utf-8") as f:
        photos = json.load(f)["photos"]

    if not photos:
        print("no photos returned for this job", file=sys.stderr)
        sys.exit(1)

    for photo in photos:
        dest = f"{out_dir}/{photo['assetId']}.jpg"
        urllib.request.urlretrieve(photo["url"], dest)
        print(f"downloaded {dest}")


if __name__ == "__main__":
    main()

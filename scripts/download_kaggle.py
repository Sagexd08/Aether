from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROVENANCE = ROOT / "data" / "provenance" / "datasets.json"
TOKEN_FILE = Path.home() / ".kaggle" / "access_token"


def have_credentials() -> bool:
    return bool(os.environ.get("KAGGLE_API_TOKEN")) or TOKEN_FILE.is_file()


def record(name: str, slug: str, dest: Path) -> None:
    data = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    entry = {
        "id": name,
        "name": name,
        "source_url": f"https://www.kaggle.com/datasets/{slug}",
        "license": "unverified",
        "license_verified": False,
        "local_path": str(dest.relative_to(ROOT)),
        "version": f"downloaded-{date.today().isoformat()}",
        "notes": "Added by download_kaggle.py. Read the dataset license on Kaggle and update.",
    }
    kept = [d for d in data["datasets"] if d["id"] != name]
    data["datasets"] = [*kept, entry]
    PROVENANCE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", help="owner/dataset-slug")
    parser.add_argument("name", help="local folder / provenance id")
    parser.add_argument("--kind", default="image", choices=["image", "video", "audio", "text"])
    args = parser.parse_args()

    if not have_credentials():
        print("No Kaggle credentials: set KAGGLE_API_TOKEN or create ~/.kaggle/access_token", file=sys.stderr)
        return 1

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    dest = ROOT / "data" / args.kind / args.name
    dest.mkdir(parents=True, exist_ok=True)
    api.dataset_download_files(args.slug, path=str(dest), unzip=True)
    record(args.name, args.slug, dest)
    print(f"Downloaded {args.slug} -> {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

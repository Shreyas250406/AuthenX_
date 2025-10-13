# ===================================================
# AuthenX AI Verification Service v4
# Detects AI, Photoshop edits, and fake geotags
# ===================================================

from dotenv import load_dotenv
import os, io, base64, requests, piexif
from PIL import Image
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ----------------------------
# Load environment
# ----------------------------
load_dotenv(".env.backend")
print("🔍 Loaded SUPABASE_URL =", os.getenv("SUPABASE_URL"))

HF_TOKEN = os.getenv("HF_TOKEN")
HF_MODEL = os.getenv("HF_MODEL", "robinhad/image-real-or-ai")
HF_TIMEOUT = int(os.getenv("HF_TIMEOUT", "12"))
AUTH_THRESHOLD = float(os.getenv("AUTHENTICITY_THRESHOLD", "0.6"))

# ----------------------------
# FastAPI app
# ----------------------------
app = FastAPI(title="AuthenX AI Image Authenticity Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.options("/{path_name:path}")
async def preflight_handler(request: Request, path_name: str):
    return JSONResponse(
        content={"message": "CORS preflight OK"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

# ----------------------------
# Request schema
# ----------------------------
class VerifyRequest(BaseModel):
    image_url: str | None = None
    image_base64: str | None = None
    asset_id: str | None = None


# ----------------------------
# Helper Functions
# ----------------------------
def dms_to_deg(dms, ref):
    try:
        deg = dms[0][0] / dms[0][1]
        minute = dms[1][0] / dms[1][1]
        second = dms[2][0] / dms[2][1]
        dec = deg + minute / 60.0 + second / 3600.0
        if ref in ["S", "W"]:
            dec = -dec
        return dec
    except Exception:
        return None


def extract_exif(img_bytes):
    """Extract GPS + software info."""
    try:
        img = Image.open(io.BytesIO(img_bytes))
        exif_data = img.info.get("exif")
        if not exif_data:
            return {}
        exif_dict = piexif.load(exif_data)
        gps = exif_dict.get("GPS", {})
        zero = exif_dict.get("0th", {})
        meta = {"gps": None, "software": None, "camera_model": None}

        if gps and piexif.GPSIFD.GPSLatitude in gps:
            lat = dms_to_deg(
                gps[piexif.GPSIFD.GPSLatitude],
                gps[piexif.GPSIFD.GPSLatitudeRef].decode(),
            )
            lon = dms_to_deg(
                gps[piexif.GPSIFD.GPSLongitude],
                gps[piexif.GPSIFD.GPSLongitudeRef].decode(),
            )
            meta["gps"] = {"lat": lat, "lon": lon}

        sw = zero.get(piexif.ImageIFD.Software)
        if sw:
            meta["software"] = sw.decode(errors="ignore")

        model = zero.get(piexif.ImageIFD.Model)
        if model:
            meta["camera_model"] = model.decode(errors="ignore")

        return meta
    except Exception as e:
        print("⚠️ extract_exif() failed:", e)
        return {}


def detect_photoshop(exif):
    sw = (exif.get("software") or "").lower()
    model = (exif.get("camera_model") or "").lower()
    editing_tools = ["photoshop", "adobe", "pixlr", "canva", "lightroom", "remove.bg", "gimp", "fotor"]
    normal_sources = ["android", "iphone", "samsung", "oneplus", "pixel", "vivo"]

    for tool in editing_tools:
        if tool in sw:
            return True, tool.capitalize()

    if any(src in sw for src in normal_sources):
        return False, None
    if not sw and not model:
        return False, None

    return False, None


def call_hf_model(image_bytes):
    """Call Hugging Face model and normalize outputs."""
    if not HF_TOKEN:
        print("⚠️ Missing HF_TOKEN — skipping inference.")
        return None
    try:
        url = f"https://api-inference.huggingface.co/models/{HF_MODEL}"
        headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "image/jpeg"}
        res = requests.post(url, headers=headers, data=image_bytes, timeout=HF_TIMEOUT)
        if res.status_code != 200:
            print("⚠️ HF API error:", res.status_code, res.text[:150])
            return None
        data = res.json()
        if isinstance(data, list):
            scores = {d["label"].lower(): d["score"] for d in data if "label" in d}
            real = scores.get("real", 0)
            fake = scores.get("fake", 0)
            ai = scores.get("ai", 0)
            return round(max(real, 1 - max(fake, ai)), 3)
        elif isinstance(data, dict):
            return float(data.get("score", 0))
        return None
    except Exception as e:
        print("⚠️ HF inference failed:", e)
        return None


def fallback_heuristic(image_bytes):
    """Simple grayscale variance heuristic."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((128, 128))
        pixels = list(img.getdata())
        mean = sum(pixels) / len(pixels)
        var = sum((p - mean) ** 2 for p in pixels) / len(pixels)
        realism = min(var / 2000.0, 1.0)
        return round(realism, 3)
    except Exception:
        return 0.6


def verify_geotag_legitimacy(gps):
    if not gps:
        return True, "No GPS — neutral"
    lat, lon = gps["lat"], gps["lon"]
    if lat is None or lon is None:
        return False, "Invalid GPS"
    if abs(lat) < 0.0001 and abs(lon) < 0.0001:
        return False, "GPS (0,0)"
    return True, "GPS valid"


def combine_auth_score(exif, realism, edited, geo_valid):
    score = realism * 0.7
    if exif.get("gps"):
        score += 0.1
    if exif.get("software"):
        score += 0.05
    if geo_valid:
        score += 0.1
    if edited:
        score -= 0.25
    if score < 0.3 and realism > 0.6:
        score += 0.3
    return round(max(min(score, 1.0), 0.0), 2)


# ----------------------------
# Main endpoint
# ----------------------------
@app.post("/verify-image")
def verify_image(req: VerifyRequest):
    print("🧠 Authenticating image...")

    # --- Accept either base64 or URL ---
    img_bytes = None
    if req.image_base64:
        try:
            header, encoded = req.image_base64.split(",", 1) if "," in req.image_base64 else ("", req.image_base64)
            img_bytes = base64.b64decode(encoded)
        except Exception as e:
            return {"success": False, "message": f"Invalid base64: {e}"}
    elif req.image_url:
        try:
            res = requests.get(req.image_url, timeout=10)
            if res.status_code != 200:
                return {"success": False, "message": "Image download failed"}
            img_bytes = res.content
        except Exception as e:
            return {"success": False, "message": f"Network error: {e}"}
    else:
        return {"success": False, "message": "No image provided"}

    # --- Analyze ---
    exif = extract_exif(img_bytes)
    edited, tool = detect_photoshop(exif)
    geo_valid, geo_reason = verify_geotag_legitimacy(exif.get("gps"))
    realism = call_hf_model(img_bytes) or fallback_heuristic(img_bytes)
    score = combine_auth_score(exif, realism, edited, geo_valid)
    is_real = score >= AUTH_THRESHOLD

    return {
        "success": True,
        "is_real": is_real,
        "authenticity_score": score,
        "realism_score": realism,
        "editing_detected": edited,
        "editing_tool": tool,
        "geotag_valid": geo_valid,
        "geotag_reason": geo_reason,
        "metadata": exif,
        "message": "✅ Real image" if is_real else "❌ Possibly AI / manipulated",
    }


@app.get("/")
def home():
    return {"message": "🚀 AuthenX AI v4 running successfully"}

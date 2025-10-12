// src/components/UserDashboard.tsx
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Shield,
  LogOut,
  Camera,
  Upload,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { supabase } from "../supabaseClient";
// @ts-ignore
import piexif from "piexifjs";

/*
  Full UserDashboard.tsx
  - AI authentication via read-only backend (http://127.0.0.1:8000)
  - Rejects fake images and deletes them
  - Marks asset pending only when all docs checked & images >= docs
  - Camera capture (EXIF), gallery upload, drag & drop
  - Document checklist updates required_documents table
  - Scrollable popup
*/

/* ---------------------------
   Configuration: AI backend
   --------------------------- */
const AI_BACKEND = import.meta.env.VITE_AI_BACKEND_URL || "http://127.0.0.1:8000";

/* ---------------------------
   EXIF / GPS helpers
   --------------------------- */
function degToRationalArray(deg: number) {
  const d = Math.floor(Math.abs(deg));
  const mFloat = (Math.abs(deg) - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

function getGpsIfd(lat: number, lon: number) {
  const latRef = lat >= 0 ? "N" : "S";
  const lonRef = lon >= 0 ? "E" : "W";
  return {
    [piexif.GPSIFD.GPSLatitudeRef]: latRef,
    [piexif.GPSIFD.GPSLatitude]: degToRationalArray(lat),
    [piexif.GPSIFD.GPSLongitudeRef]: lonRef,
    [piexif.GPSIFD.GPSLongitude]: degToRationalArray(lon),
  };
}

function insertExifIntoJpegDataUrl(dataUrl: string, lat: number, lon: number) {
  const exifObj: any = { "0th": {}, Exif: {}, GPS: getGpsIfd(lat, lon) };
  const exifBytes = piexif.dump(exifObj);
  return piexif.insert(exifBytes, dataUrl);
}

async function dataURLToBlob(dataUrl: string) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

const getAddressFromCoords = async (lat: number, lon: number): Promise<string> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`
    );
    const data = await res.json();
    return data.display_name || "Unknown Location";
  } catch {
    return "Unknown Location";
  }
};

/* ---------------------------
   Types / interfaces
   --------------------------- */
interface Asset {
  id: string;
  asset_name: string;
  status: "pending" | "non-verified" | "authenticated";
  issued_date?: string;
  user_id?: string;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_address?: string | null;
  created_at?: string;
  verified_at?: string | null;
}

interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
}

interface RequiredDoc {
  id: string;
  document_name: string;
  is_uploaded: boolean;
  uploaded_at?: string | null;
}

interface UserDashboardProps {
  onLogout: () => void;
  phone: string;
}

/* ---------------------------
   Component
   --------------------------- */
export function UserDashboard({ onLogout, phone }: UserDashboardProps) {
  // user + assets
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // upload & images
  const [assetImages, setAssetImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false); // AI verification in progress
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // UI dialogs
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // required documents
  const [requiredDocs, setRequiredDocs] = useState<RequiredDoc[]>([]);

  /* ---------------------------
     Fetch user + assets on mount / phone change
     --------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const formattedPhone = phone.startsWith("+") ? phone : "+91" + phone;
        const { data: userData, error: userErr } = await supabase
          .from("users")
          .select("*")
          .or(`phone.eq.${phone},phone.eq.${formattedPhone}`)
          .single();

        if (userErr) {
          console.error("User fetch error:", userErr);
          setUser(null);
          return;
        }
        setUser(userData || null);

        if (userData && userData.id) {
          const { data: assetData, error: assetErr } = await supabase
            .from("assets")
            .select("*")
            .eq("user_id", userData.id)
            .order("created_at", { ascending: false });

          if (assetErr) {
            console.error("Assets fetch error:", assetErr);
            setAssets([]);
          } else {
            setAssets(assetData || []);
          }
        }
      } catch (err) {
        console.error("Fetch user/assets error:", err);
      }
    })();
  }, [phone]);

  /* ---------------------------
     Fetch required_documents for an asset
     --------------------------- */
  async function fetchRequiredDocuments(assetId: string) {
    try {
      const { data, error } = await supabase
        .from("required_documents")
        .select("id, document_name, is_uploaded, uploaded_at")
        .eq("asset_id", assetId)
        .order("id", { ascending: true });

      if (error) {
        console.error("fetchRequiredDocuments error:", error);
        setRequiredDocs([]);
        return;
      }
      setRequiredDocs(data || []);
    } catch (err) {
      console.error("fetchRequiredDocuments exception:", err);
      setRequiredDocs([]);
    }
  }

  /* ---------------------------
     Toggle document checkbox
     - updates DB and local state
     - then checks pending condition
     --------------------------- */
  async function handleDocumentCheck(docId: string, newValue: boolean) {
    try {
      const { error } = await supabase
        .from("required_documents")
        .update({
          is_uploaded: newValue,
          uploaded_at: newValue ? new Date().toISOString() : null,
        })
        .eq("id", docId);

      if (error) throw error;

      setRequiredDocs((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, is_uploaded: newValue, uploaded_at: newValue ? new Date().toISOString() : null } : d
        )
      );

      // After updating the checkbox, check if we can mark asset pending
      await checkAndSetPendingStatus();
    } catch (err) {
      console.error("handleDocumentCheck error:", err);
      alert("Failed to update document status. See console for details.");
    }
  }

  /* ---------------------------
     Fetch asset images list from Supabase storage
     --------------------------- */
  async function fetchAssetImages(assetId: string) {
    try {
      const { data: files, error } = await supabase.storage.from("asset-images").list(`${assetId}/`);
      if (error) {
        console.warn("Storage list error:", error);
        setAssetImages([]);
        return;
      }

      const urls =
        files?.map(
          (f) =>
            `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/asset-images/${assetId}/${f.name}`
        ) || [];

      setAssetImages(urls);
      setCurrentImageIndex(0);
    } catch (err) {
      console.error("fetchAssetImages exception:", err);
      setAssetImages([]);
    }
  }

  /* ---------------------------
     Delete a specific image by public URL
     - extracts storage path after "/asset-images/"
     - deletes and refreshes lists
     --------------------------- */
  async function handleDeleteImage(publicUrl: string) {
    if (!selectedAsset) return;
    try {
      setProcessing(true);

      // Extract path after "/asset-images/"
      const parts = publicUrl.split("/asset-images/");
      if (parts.length < 2) {
        console.error("Invalid publicUrl for deletion:", publicUrl);
        return;
      }
      const pathWithQuery = parts[1];
      const path = pathWithQuery.split("?")[0];

      const { error } = await supabase.storage.from("asset-images").remove([path]);
      if (error) {
        console.error("Supabase remove error:", error);
        alert("Failed to delete image. See console.");
      } else {
        // Refresh images and assets list
        await fetchAssetImages(selectedAsset.id);
        if (user) {
          const { data: refreshed } = await supabase
            .from("assets")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          setAssets(refreshed || []);
        }
        // After deletion, re-check pending condition (it may now be false)
        await checkAndSetPendingStatus();
      }
    } catch (err) {
      console.error("handleDeleteImage exception:", err);
    } finally {
      setProcessing(false);
    }
  }

  /* ---------------------------
     AI verification call (read-only)
     - expects backend returns {"is_real": boolean, "authenticity_score": number, ...}
     - does not change DB
     --------------------------- */
  async function verifyImage(imageUrl: string) {
    try {
      const res = await fetch(`${AI_BACKEND}/verify-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, asset_id: selectedAsset?.id ?? "" }),
      });

      if (!res.ok) {
        console.error("AI verify endpoint returned non-OK:", res.status);
        return { is_real: false, authenticity_score: 0, reason: "verify-failed" };
      }

      const json = await res.json();
      const is_real = typeof json.is_real === "boolean" ? json.is_real : !!json.valid;
      const score = typeof json.authenticity_score === "number" ? json.authenticity_score : json.score ?? 0;
      const reason = json.reason || json.message || "";

      return { is_real, authenticity_score: score, reason };
    } catch (err) {
      console.error("verifyImage error:", err);
      return { is_real: false, authenticity_score: 0, reason: "network-error" };
    }
  }

  /* ---------------------------
     Upload image to Supabase storage then verify with AI
     - if AI rejects -> delete stored file
     - if AI accepts -> update asset.image_url (preview)
     - after accept -> refresh images & check pending condition
     --------------------------- */
  async function uploadImageToSupabase(assetId: string, blob: Blob, lat: number | null, lon: number | null) {
    const timestamp = Date.now();
    const fileName = `${timestamp}.jpg`;
    const filePath = `${assetId}/${fileName}`;

    try {
      setProcessing(true);
      setUploadProgress(5);

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from("asset-images")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

      if (uploadError) {
        // Try upsert fallback
        console.warn("Upload error; trying upsert:", uploadError.message || uploadError);
        const { error: upsertErr } = await supabase.storage
          .from("asset-images")
          .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
        if (upsertErr) throw upsertErr;
      }

      setUploadProgress(35);

      const { data: publicUrlData } = supabase.storage.from("asset-images").getPublicUrl(filePath);
      const image_url =
        publicUrlData?.publicUrl ||
        `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/asset-images/${filePath}`;

      setUploadProgress(45);

      // Call AI verification
      const verification = await verifyImage(image_url);
      setUploadProgress(75);

      if (!verification.is_real) {
        // Delete uploaded file because verification failed
        try {
          await supabase.storage.from("asset-images").remove([filePath]);
        } catch (err) {
          console.warn("Failed to remove invalid image:", err);
        }

        alert(
          `❌ Image rejected by verification (score ${(verification.authenticity_score * 100).toFixed(
            1
          )}%). Reason: ${verification.reason || "rejected"}`
        );
        setUploadProgress(0);
        return;
      }

      // AI accepted -> update asset preview fields (but do not change "authenticated")
      const address = lat != null && lon != null ? await getAddressFromCoords(lat, lon) : null;
      const { error: updErr } = await supabase
        .from("assets")
        .update({
          image_url,
          latitude: lat ?? null,
          longitude: lon ?? null,
          location_address: address ?? null,
        })
        .eq("id", assetId);

      if (updErr) console.warn("Preview update failed:", updErr);

      setUploadProgress(90);

      // Refresh images list and assets list
      await fetchAssetImages(assetId);
      if (user) {
        const { data: refreshed } = await supabase
          .from("assets")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setAssets(refreshed || []);
      }

      // After successful upload+verify, re-check pending condition
      await checkAndSetPendingStatus();

      alert(`✅ Image accepted (score ${(verification.authenticity_score * 100).toFixed(1)}%).`);
      setUploadProgress(100);
    } catch (err) {
      console.error("uploadImageToSupabase error:", err);
      alert("Upload failed. See console for details.");
    } finally {
      setProcessing(false);
      setTimeout(() => setUploadProgress(0), 600);
    }
  }

  /* ---------------------------
     Check & set pending status:
     - If all required docs have is_uploaded = true
     - AND number of uploaded images >= number of required docs
     -> set asset.status = 'pending'
     --------------------------- */
  async function checkAndSetPendingStatus() {
    if (!selectedAsset) return;

    // Refresh docs & images to get latest values
    await fetchRequiredDocuments(selectedAsset.id);
    await fetchAssetImages(selectedAsset.id);

    const docs = requiredDocs.length ? requiredDocs : [];
    const allDocsUploaded = docs.length > 0 ? docs.every((d) => d.is_uploaded) : false;
    const enoughImages = assetImages.length >= docs.length;

    // Note: requiredDocs state might be slightly stale at time of call; rely on DB fetch above.
    // Recompute from DB values retrieved via fetchRequiredDocuments (which updated state).
    const docsFromState = requiredDocs;
    const allUploadedFromState = docsFromState.length > 0 ? docsFromState.every((d) => d.is_uploaded) : false;
    const enoughImagesFromState = assetImages.length >= docsFromState.length;

    if (allUploadedFromState && enoughImagesFromState) {
      try {
        const { error } = await supabase.from("assets").update({ status: "pending" }).eq("id", selectedAsset.id);
        if (error) {
          console.error("Failed to set asset to pending:", error);
        } else {
          // update local assets state
          if (user) {
            const { data: refreshed } = await supabase
              .from("assets")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false });
            setAssets(refreshed || []);
          }
        }
      } catch (err) {
        console.error("checkAndSetPendingStatus exception:", err);
      }
    }
  }

  /* ---------------------------
     Camera capture flow
     --------------------------- */
  const handleCameraCapture = async () => {
    setShowUploadDialog(false);
    setShowCamera(true);

    // Pre-prompt geolocation (non-blocking)
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {
        console.warn("Geolocation permission not granted.");
      },
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    if (showCamera) {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const video = document.getElementById("camera-stream") as HTMLVideoElement | null;
          if (video) {
            video.srcObject = stream;
            await video.play().catch(() => {});
          }
        } catch (err) {
          console.error("Camera start failed:", err);
          setShowCamera(false);
        }
      })();
    } else {
      // stop camera
      const video = document.getElementById("camera-stream") as HTMLVideoElement | null;
      if (video) {
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCamera]);

  const handleCaptureAndUploadWithExif = async () => {
    if (!selectedAsset) return;
    try {
      setUploading(true);
      setUploadProgress(5);

      const video = document.getElementById("camera-stream") as HTMLVideoElement | null;
      if (!video) throw new Error("Camera stream not available");

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);

      // Try to get geolocation
      let lat = 0;
      let lon = 0;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch (err) {
        console.warn("Geolocation at capture failed:", err);
        lat = 0;
        lon = 0;
      }

      // Insert EXIF GPS
      const exifDataUrl = insertExifIntoJpegDataUrl(jpegDataUrl, lat, lon);
      const blob = await dataURLToBlob(exifDataUrl);

      setUploadProgress(25);
      await uploadImageToSupabase(selectedAsset.id, blob, lat, lon);

      // stop camera
      const stream = (video.srcObject as MediaStream | null);
      stream?.getTracks().forEach((t) => t.stop());
      setShowCamera(false);
    } catch (err) {
      console.error("handleCaptureAndUploadWithExif error:", err);
      alert("Capture failed. See console for details.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  /* ---------------------------
     Gallery upload handler
     --------------------------- */
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAsset) return;

    try {
      setUploading(true);
      setUploadProgress(5);

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;

        // Try EXIF GPS first
        let lat: number | null = null;
        let lon: number | null = null;
        try {
          const exif = piexif.load(dataUrl);
          if (exif?.GPS && exif.GPS[piexif.GPSIFD.GPSLatitude]) {
            const latArr = exif.GPS[piexif.GPSIFD.GPSLatitude];
            const lonArr = exif.GPS[piexif.GPSIFD.GPSLongitude];
            const latRef = exif.GPS[piexif.GPSIFD.GPSLatitudeRef];
            const lonRef = exif.GPS[piexif.GPSIFD.GPSLongitudeRef];
            const latDeg = latArr[0][0] + latArr[1][0] / 60 + latArr[2][0] / 3600;
            const lonDeg = lonArr[0][0] + lonArr[1][0] / 60 + lonArr[2][0] / 3600;
            lat = latDeg * (latRef === "S" ? -1 : 1);
            lon = lonDeg * (lonRef === "W" ? -1 : 1);
          }
        } catch (err) {
          // ignore
        }

        // fallback to geolocation
        if (lat == null || lon == null) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
            );
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
          } catch (err) {
            console.warn("Geolocation fallback failed:", err);
            lat = 0;
            lon = 0;
          }
        }

        setUploadProgress(35);
        const blob = await (await fetch(dataUrl)).blob();
        setUploadProgress(60);
        await uploadImageToSupabase(selectedAsset.id, blob, lat, lon);
        setUploadProgress(100);
        setShowUploadDialog(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("handleGalleryUpload error:", err);
      alert("Upload failed. See console.");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 700);
    }
  };

  /* ---------------------------
     Drag & drop upload
     --------------------------- */
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!selectedAsset) {
      alert("Select an asset first.");
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadProgress(5);

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;

        let lat: number | null = null;
        let lon: number | null = null;
        try {
          const exif = piexif.load(dataUrl);
          if (exif?.GPS && exif.GPS[piexif.GPSIFD.GPSLatitude]) {
            const latArr = exif.GPS[piexif.GPSIFD.GPSLatitude];
            const lonArr = exif.GPS[piexif.GPSIFD.GPSLongitude];
            const latRef = exif.GPS[piexif.GPSIFD.GPSLatitudeRef];
            const lonRef = exif.GPS[piexif.GPSIFD.GPSLongitudeRef];
            const latDeg = latArr[0][0] + latArr[1][0] / 60 + latArr[2][0] / 3600;
            const lonDeg = lonArr[0][0] + lonArr[1][0] / 60 + lonArr[2][0] / 3600;
            lat = latDeg * (latRef === "S" ? -1 : 1);
            lon = lonDeg * (lonRef === "W" ? -1 : 1);
          }
        } catch {
          // ignore
        }

        if (lat == null || lon == null) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
            );
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
          } catch {
            lat = 0;
            lon = 0;
          }
        }

        setUploadProgress(35);
        const blob = await (await fetch(dataUrl)).blob();
        setUploadProgress(60);
        await uploadImageToSupabase(selectedAsset.id, blob, lat, lon);
        setUploadProgress(100);
        setShowUploadDialog(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Drag upload error:", err);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 700);
    }
  };

  /* ---------------------------
     Small helper: open asset dialog
     --------------------------- */
  const openAssetDialog = async (asset: Asset) => {
    setSelectedAsset(asset);
    setShowUploadDialog(true);
    await fetchAssetImages(asset.id);
    await fetchRequiredDocuments(asset.id);
  };

  /* ---------------------------
     Render helpers
     --------------------------- */
  const pendingAssets = assets.filter((a) => a.status === "pending");
  const nonVerifiedAssets = assets.filter((a) => a.status === "non-verified");
  const authenticatedAssets = assets.filter((a) => a.status === "authenticated");

  const renderAssetCard = (asset: Asset) => (
    <Card
      key={asset.id}
      className="p-6 bg-white rounded-xl shadow-sm cursor-pointer hover:shadow-md"
      onClick={() => openAssetDialog(asset)}
    >
      <h3 className="font-semibold text-lg">{asset.asset_name}</h3>
      <p className="text-sm text-gray-500 mb-2">Issued: {asset.issued_date || "—"}</p>

      {asset.image_url ? (
        <img src={asset.image_url} alt={asset.asset_name} className="rounded-lg mb-2 w-full h-40 object-cover border" />
      ) : (
        <div className="rounded-lg mb-2 w-full h-40 bg-gray-50 flex items-center justify-center text-sm text-gray-400 border">
          No Image
        </div>
      )}

      {asset.location_address && (
        <p className="text-xs text-gray-600">
          📍 {asset.location_address}
          {asset.latitude && asset.longitude && (
            <a
              href={`https://www.google.com/maps?q=${asset.latitude},${asset.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline ml-2"
            >
              View on Maps
            </a>
          )}
        </p>
      )}

      <Badge
        className={
          asset.status === "authenticated"
            ? "bg-green-100 text-green-700"
            : asset.status === "pending"
            ? "bg-yellow-100 text-yellow-700"
            : "bg-red-100 text-red-700"
        }
      >
        {asset.status}
      </Badge>
    </Card>
  );

  const handlePrevImage = () =>
    setCurrentImageIndex((prev) => (prev - 1 + assetImages.length) % assetImages.length);
  const handleNextImage = () => setCurrentImageIndex((prev) => (prev + 1) % assetImages.length);

  /* ---------------------------
     JSX render
     --------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-100 via-pink-100 to-rose-100">
      {/* Header */}
      <motion.div className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-pink-600 p-3 rounded-xl shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-pink-600">
                AuthenX
              </h1>
              <p className="text-xs text-gray-600">{user ? `Welcome, ${user.name}` : "My Assigned Assets"}</p>
            </div>
          </div>

          <Button variant="ghost" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="non-verified" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white rounded-lg shadow-sm">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="non-verified">Non-Verified</TabsTrigger>
            <TabsTrigger value="authenticated">Authenticated</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">{pendingAssets.map(renderAssetCard)}</div>
            ) : (
              <p className="text-center text-gray-500 py-8">No pending assets</p>
            )}
          </TabsContent>

          <TabsContent value="non-verified">
            {nonVerifiedAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">{nonVerifiedAssets.map(renderAssetCard)}</div>
            ) : (
              <p className="text-center text-gray-500 py-8">No non-verified assets</p>
            )}
          </TabsContent>

          <TabsContent value="authenticated">
            {authenticatedAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">{authenticatedAssets.map(renderAssetCard)}</div>
            ) : (
              <p className="text-center text-gray-500 py-8">No authenticated assets</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload / Images Dialog */}
      <AlertDialog
        open={showUploadDialog}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAsset(null);
            setAssetImages([]);
            setRequiredDocs([]);
          }
          setShowUploadDialog(open);
        }}
      >
        <AlertDialogContent className="max-w-2xl bg-white rounded-2xl shadow-2xl overflow-y-auto max-h-[85vh]">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedAsset?.asset_name}</AlertDialogTitle>
          </AlertDialogHeader>

          {processing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="animate-spin w-6 h-6 text-blue-600" />
              <div className="text-sm text-gray-600">Processing authenticity...</div>
            </div>
          ) : (
            <>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={handleCameraCapture}
                    className="h-24 flex flex-col gap-2 bg-blue-600 text-white"
                  >
                    <Camera className="w-8 h-8" />
                    <span>Open Camera</span>
                  </Button>

                  <label
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="h-24 flex flex-col justify-center items-center border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 text-sm"
                  >
                    <Upload className="w-8 h-8 mb-1 text-blue-600" />
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleGalleryUpload} />
                    <div className="text-[10px] text-gray-400 mt-1">or drag & drop here</div>
                  </label>
                </div>

                {uploading && (
                  <div className="text-sm text-gray-500 text-center pt-2">Uploading... {uploadProgress}%</div>
                )}

                {/* Images carousel */}
                {assetImages.length > 0 && (
                  <div className="mt-4">
                    <div className="relative flex items-center justify-center">
                      <img
                        src={assetImages[currentImageIndex]}
                        alt="uploaded"
                        className="max-h-72 rounded-xl border shadow"
                      />
                      {assetImages.length > 1 && (
                        <>
                          <button
                            onClick={handlePrevImage}
                            className="absolute left-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                          >
                            <ChevronLeft className="w-6 h-6 text-gray-700" />
                          </button>
                          <button
                            onClick={handleNextImage}
                            className="absolute right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                          >
                            <ChevronRight className="w-6 h-6 text-gray-700" />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleDeleteImage(assetImages[currentImageIndex])}
                        className="absolute top-2 right-2 bg-white p-1 rounded-full shadow hover:bg-gray-100"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-gray-500 text-center">
                      {currentImageIndex + 1} / {assetImages.length}
                    </div>
                  </div>
                )}

                {/* Documents checklist */}
                {requiredDocs.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h3 className="font-semibold mb-2 text-gray-700">Required Documents</h3>
                    <ul className="space-y-2">
                      {requiredDocs.map((doc) => (
                        <li key={doc.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg shadow-sm">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={doc.is_uploaded}
                              onChange={(e) => handleDocumentCheck(doc.id, e.target.checked)}
                              className="w-4 h-4 accent-green-600"
                            />
                            <span className="text-sm">{doc.document_name}</span>
                          </label>
                          <span className={`text-xs ${doc.is_uploaded ? "text-green-600" : "text-gray-400"}`}>
                            {doc.is_uploaded ? "Uploaded" : "Pending"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Camera modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-4 w-[90%] max-w-md">
            <video id="camera-stream" autoPlay playsInline className="w-full h-72 rounded-lg" />
            <div className="flex gap-3 mt-4">
              <Button
                className="bg-blue-600 text-white"
                onClick={handleCaptureAndUploadWithExif}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Capture & Upload"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const video = document.getElementById("camera-stream") as HTMLVideoElement | null;
                  const stream = video?.srcObject as MediaStream | null;
                  stream?.getTracks().forEach((t) => t.stop());
                  setShowCamera(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDashboard;

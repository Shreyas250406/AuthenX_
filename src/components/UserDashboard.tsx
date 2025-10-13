// ==========================================================
// AuthenX UserDashboard.tsx — v4 (Safe Upload Verification)
// ==========================================================
// ✅ Verifies image with AI backend BEFORE uploading
// ✅ Prevents fake image storage
// ✅ Supports camera, gallery, drag-drop
// ✅ Updates required documents checklist
// ✅ Automatically sets asset to "pending" when complete
// ==========================================================

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
  - Verifies authenticity BEFORE upload
  - Rejects fake images instantly (no storage waste)
  - AI backend URL: import.meta.env.VITE_AI_BACKEND_URL
  - EXIF embedding + reverse geocoding
  - Tracks required_documents & auto status = pending
  - Camera capture, gallery, drag-drop
*/

const AI_BACKEND =
  import.meta.env.VITE_AI_BACKEND_URL || "http://127.0.0.1:8000";

/* -----------------------------------------------------
   Utility: Convert degrees to rational array for EXIF
   ----------------------------------------------------- */
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

/* -----------------------------------------------------
   Utility: Build GPS EXIF structure
   ----------------------------------------------------- */
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

const getAddressFromCoords = async (
  lat: number,
  lon: number
): Promise<string> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    );
    const data = await res.json();
    return data.display_name || "Unknown Location";
  } catch {
    return "Unknown Location";
  }
};

/* -----------------------------------------------------
   Interfaces
   ----------------------------------------------------- */
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

/* -----------------------------------------------------
   Main Component
   ----------------------------------------------------- */
export function UserDashboard({ onLogout, phone }: UserDashboardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const [assetImages, setAssetImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const [requiredDocs, setRequiredDocs] = useState<RequiredDoc[]>([]);

  /* -----------------------------------------------------
     Fetch user and assets
     ----------------------------------------------------- */
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
          return;
        }
        setUser(userData || null);

        if (userData?.id) {
          const { data: assetData } = await supabase
            .from("assets")
            .select("*")
            .eq("user_id", userData.id)
            .order("created_at", { ascending: false });
          setAssets(assetData || []);
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    })();
  }, [phone]);

  /* -----------------------------------------------------
     Required documents
     ----------------------------------------------------- */
  async function fetchRequiredDocuments(assetId: string) {
    try {
      const { data, error } = await supabase
        .from("required_documents")
        .select("id, document_name, is_uploaded, uploaded_at")
        .eq("asset_id", assetId)
        .order("id", { ascending: true });
      if (error) throw error;
      setRequiredDocs(data || []);
    } catch (err) {
      console.error("fetchRequiredDocuments error:", err);
    }
  }

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
          d.id === docId
            ? {
                ...d,
                is_uploaded: newValue,
                uploaded_at: newValue ? new Date().toISOString() : null,
              }
            : d
        )
      );
      await checkAndSetPendingStatus();
    } catch (err) {
      console.error("handleDocumentCheck error:", err);
    }
  }

  /* -----------------------------------------------------
     Fetch Asset Images
     ----------------------------------------------------- */
  async function fetchAssetImages(assetId: string) {
    try {
      const { data: files } = await supabase.storage
        .from("asset-images")
        .list(`${assetId}/`);
      const urls =
        files?.map(
          (f) =>
            `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/asset-images/${assetId}/${f.name}`
        ) || [];
      setAssetImages(urls);
      setCurrentImageIndex(0);
    } catch (err) {
      console.error("fetchAssetImages error:", err);
      setAssetImages([]);
    }
  }

  /* -----------------------------------------------------
     Delete image
     ----------------------------------------------------- */
  async function handleDeleteImage(publicUrl: string) {
    if (!selectedAsset) return;
    try {
      setProcessing(true);
      const parts = publicUrl.split("/asset-images/");
      if (parts.length < 2) return;
      const path = parts[1].split("?")[0];
      await supabase.storage.from("asset-images").remove([path]);
      await fetchAssetImages(selectedAsset.id);
      await checkAndSetPendingStatus();
    } catch (err) {
      console.error("handleDeleteImage error:", err);
    } finally {
      setProcessing(false);
    }
  }

  /* -----------------------------------------------------
     Upload verified images only (AI → Upload)
     ----------------------------------------------------- */
  async function uploadImageToSupabase(
    assetId: string,
    blob: Blob,
    lat: number | null,
    lon: number | null
  ) {
    const timestamp = Date.now();
    const fileName = `${timestamp}.jpg`;
    const filePath = `${assetId}/${fileName}`;

    try {
      setProcessing(true);
      setUploadProgress(10);

      // Convert blob to base64 for AI verification
      const base64data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      // Verify before uploading
      const verifyRes = await fetch(`${AI_BACKEND}/verify-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64data, asset_id: assetId }),
      });

      if (!verifyRes.ok) {
        alert("AI verification failed. Please try again.");
        return;
      }

      const verifyJson = await verifyRes.json();
      const is_real = verifyJson.is_real === true;
      const score = verifyJson.authenticity_score ?? 0;
      const reason = verifyJson.message ?? "Rejected";

      if (!is_real) {
        alert(
          `❌ Image rejected by AI (score ${(score * 100).toFixed(
            1
          )}%). Reason: ${reason}`
        );
        return;
      }

      // Upload only if real
      setUploadProgress(50);
      const { error: uploadError } = await supabase.storage
        .from("asset-images")
        .upload(filePath, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        alert("Upload failed.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("asset-images")
        .getPublicUrl(filePath);
      const image_url =
        publicUrlData?.publicUrl ||
        `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/asset-images/${filePath}`;

      const address =
        lat != null && lon != null ? await getAddressFromCoords(lat, lon) : null;
      await supabase
        .from("assets")
        .update({
          image_url,
          latitude: lat ?? null,
          longitude: lon ?? null,
          location_address: address ?? null,
        })
        .eq("id", assetId);

      await fetchAssetImages(assetId);
      await checkAndSetPendingStatus();

      alert(`✅ Image accepted (score ${(score * 100).toFixed(1)}%)`);
      setUploadProgress(100);
    } catch (err) {
      console.error("uploadImageToSupabase error:", err);
      alert("Upload failed.");
    } finally {
      setProcessing(false);
      setTimeout(() => setUploadProgress(0), 700);
    }
  }

  /* -----------------------------------------------------
     Pending check
     ----------------------------------------------------- */
  async function checkAndSetPendingStatus() {
    if (!selectedAsset) return;
    await fetchRequiredDocuments(selectedAsset.id);
    await fetchAssetImages(selectedAsset.id);

    const allDocsUploaded =
      requiredDocs.length > 0 && requiredDocs.every((d) => d.is_uploaded);
    const enoughImages = assetImages.length >= requiredDocs.length;

    if (allDocsUploaded && enoughImages) {
      await supabase
        .from("assets")
        .update({ status: "pending" })
        .eq("id", selectedAsset.id);
      if (user) {
        const { data } = await supabase
          .from("assets")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setAssets(data || []);
      }
    }
  }

  /* -----------------------------------------------------
     Camera capture flow
     ----------------------------------------------------- */
  const handleCameraCapture = async () => {
    setShowUploadDialog(false);
    setShowCamera(true);
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    if (showCamera) {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const video = document.getElementById(
            "camera-stream"
          ) as HTMLVideoElement | null;
          if (video) {
            video.srcObject = stream;
            await video.play().catch(() => {});
          }
        } catch {
          setShowCamera(false);
        }
      })();
    } else {
      const video = document.getElementById(
        "camera-stream"
      ) as HTMLVideoElement | null;
      if (video) {
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    }
  }, [showCamera]);

  const handleCaptureAndUploadWithExif = async () => {
    if (!selectedAsset) return;
    try {
      setUploading(true);
      const video = document.getElementById(
        "camera-stream"
      ) as HTMLVideoElement | null;
      if (!video) throw new Error("Camera not active");

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.9);

      let lat = 0,
        lon = 0;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
          })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        lat = 0;
        lon = 0;
      }

      const exifDataUrl = insertExifIntoJpegDataUrl(jpegDataUrl, lat, lon);
      const blob = await dataURLToBlob(exifDataUrl);
      await uploadImageToSupabase(selectedAsset.id, blob, lat, lon);

      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      setShowCamera(false);
    } catch (err) {
      console.error("handleCapture error:", err);
    } finally {
      setUploading(false);
    }
  };

  /* -----------------------------------------------------
     Gallery Upload
     ----------------------------------------------------- */
  const handleGalleryUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAsset) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      const blob = await (await fetch(dataUrl)).blob();
      let lat = 0,
        lon = 0;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
          })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        lat = 0;
        lon = 0;
      }
      await uploadImageToSupabase(selectedAsset.id, blob, lat, lon);
      setShowUploadDialog(false);
    };
    reader.readAsDataURL(file);
  };

  /* -----------------------------------------------------
     Drag-drop Upload
     ----------------------------------------------------- */
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string;
      const blob = await (await fetch(dataUrl)).blob();
      await uploadImageToSupabase(selectedAsset.id, blob, 0, 0);
      setShowUploadDialog(false);
    };
    reader.readAsDataURL(file);
  };

  /* -----------------------------------------------------
     Asset Dialog
     ----------------------------------------------------- */
  const openAssetDialog = async (asset: Asset) => {
    setSelectedAsset(asset);
    setShowUploadDialog(true);
    await fetchAssetImages(asset.id);
    await fetchRequiredDocuments(asset.id);
  };

  const pendingAssets = assets.filter((a) => a.status === "pending");
  const nonVerifiedAssets = assets.filter((a) => a.status === "non-verified");
  const authenticatedAssets = assets.filter(
    (a) => a.status === "authenticated"
  );

  const renderAssetCard = (asset: Asset) => (
    <Card
      key={asset.id}
      className="p-6 bg-white rounded-xl shadow-sm cursor-pointer hover:shadow-md"
      onClick={() => openAssetDialog(asset)}
    >
      <h3 className="font-semibold text-lg">{asset.asset_name}</h3>
      <p className="text-sm text-gray-500 mb-2">
        Issued: {asset.issued_date || "—"}
      </p>
      {asset.image_url ? (
        <img
          src={asset.image_url}
          alt={asset.asset_name}
          className="rounded-lg mb-2 w-full h-40 object-cover border"
        />
      ) : (
        <div className="rounded-lg mb-2 w-full h-40 bg-gray-50 flex items-center justify-center text-sm text-gray-400 border">
          No Image
        </div>
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
    setCurrentImageIndex(
      (prev) => (prev - 1 + assetImages.length) % assetImages.length
    );
  const handleNextImage = () =>
    setCurrentImageIndex((prev) => (prev + 1) % assetImages.length);

  /* -----------------------------------------------------
     RENDER
     ----------------------------------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-100 via-pink-100 to-rose-100">
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
              <p className="text-xs text-gray-600">
                {user ? `Welcome, ${user.name}` : "My Assigned Assets"}
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="non-verified" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-white rounded-lg shadow-sm">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="non-verified">Non-Verified</TabsTrigger>
            <TabsTrigger value="authenticated">Authenticated</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">
                {pendingAssets.map(renderAssetCard)}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                No pending assets
              </p>
            )}
          </TabsContent>

          <TabsContent value="non-verified">
            {nonVerifiedAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">
                {nonVerifiedAssets.map(renderAssetCard)}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                No non-verified assets
              </p>
            )}
          </TabsContent>

          <TabsContent value="authenticated">
            {authenticatedAssets.length ? (
              <div className="grid md:grid-cols-2 gap-4">
                {authenticatedAssets.map(renderAssetCard)}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                No authenticated assets
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload Dialog */}
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
              <div className="text-sm text-gray-600">
                Processing authenticity...
              </div>
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
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleGalleryUpload}
                    />
                    <div className="text-[10px] text-gray-400 mt-1">
                      or drag & drop here
                    </div>
                  </label>
                </div>

                {uploading && (
                  <div className="text-sm text-gray-500 text-center pt-2">
                    Uploading... {uploadProgress}%
                  </div>
                )}

                {assetImages.length > 0 && (
                  <div className="mt-4 relative flex flex-col items-center">
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
                      onClick={() =>
                        handleDeleteImage(assetImages[currentImageIndex])
                      }
                      className="absolute top-2 right-2 bg-white p-1 rounded-full shadow hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                    <div className="mt-2 text-xs text-gray-500 text-center">
                      {currentImageIndex + 1} / {assetImages.length}
                    </div>
                  </div>
                )}

                {requiredDocs.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h3 className="font-semibold mb-2 text-gray-700">
                      Required Documents
                    </h3>
                    <ul className="space-y-2">
                      {requiredDocs.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex items-center justify-between bg-gray-50 p-2 rounded-lg shadow-sm"
                        >
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={doc.is_uploaded}
                              onChange={(e) =>
                                handleDocumentCheck(doc.id, e.target.checked)
                              }
                              className="w-4 h-4 accent-green-600"
                            />
                            <span className="text-sm">
                              {doc.document_name}
                            </span>
                          </label>
                          <span
                            className={`text-xs ${
                              doc.is_uploaded
                                ? "text-green-600"
                                : "text-gray-400"
                            }`}
                          >
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
            <video
              id="camera-stream"
              autoPlay
              playsInline
              className="w-full h-72 rounded-lg"
            />
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
                  const video = document.getElementById(
                    "camera-stream"
                  ) as HTMLVideoElement | null;
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

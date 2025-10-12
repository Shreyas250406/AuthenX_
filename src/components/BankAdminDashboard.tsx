import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Shield,
  Search,
  LogOut,
  Download,
  UserPlus,
  Upload,
  FileSpreadsheet,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

export function BankAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [userForm, setUserForm] = useState({
    name: "",
    phone: "",
    asset: "",
    documents: "",
  });
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [assetDetails, setAssetDetails] = useState<any | null>(null);
  const [assetImages, setAssetImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [processing, setProcessing] = useState(false);

  // ✅ Fetch all users
  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, phone, asset, status, role")
      .eq("role", "user");
    if (!error) setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ✅ Filter + Search
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === "all" ? true : u.status?.toLowerCase() === filter;
    return matchesSearch && matchesFilter;
  });

  // ✅ Fetch asset + documents + images
  const fetchAssetDetails = async (userId: string) => {
    const { data: asset } = await supabase
      .from("assets")
      .select("id, asset_name, issued_date, status")
      .eq("user_id", userId)
      .single();

    if (!asset) return;

    const { data: docs } = await supabase
      .from("required_documents")
      .select("document_name, is_uploaded, uploaded_at")
      .eq("asset_id", asset.id);

    let imageList: string[] = [];
    if (asset.status === "pending") {
      const { data: files } = await supabase.storage
        .from("asset-images")
        .list(asset.id + "/");
      imageList =
        files?.map(
          (f) =>
            `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/asset-images/${asset.id}/${f.name}`
        ) || [];
    }

    setAssetDetails({ ...asset, documents: docs || [] });
    setAssetImages(imageList);
    setCurrentImageIndex(0);
  };

  // ✅ Modal open
  const handleUserClick = (user: any) => {
    setSelectedUser(user);
    fetchAssetDetails(user.id);
  };

  // ✅ Grant / Non-Grant actions
  const handleStatusUpdate = async (newStatus: string) => {
    if (!assetDetails) return;
    setProcessing(true);
    await supabase.from("assets").update({ status: newStatus }).eq("id", assetDetails.id);
    await fetchUsers();
    setProcessing(false);
    setSelectedUser(null);
  };

  // ✅ Download sample Excel
  const handleDownloadSample = () => {
    const sample = [
      {
        name: "Ramesh Kumar",
        phone: "9876543210",
        asset_name: "Tractor Loan",
        documents: "Aadhaar Card, Land Proof, Income Certificate",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample");
    XLSX.writeFile(wb, "sample_user_upload.xlsx");
  };

  // ✅ Add user manually
  const handleAddUser = async () => {
    if (!userForm.name || !userForm.phone || !userForm.asset) {
      alert("⚠️ Please fill all fields");
      return;
    }

    const { data: userData } = await supabase
      .from("users")
      .insert([
        {
          name: userForm.name,
          phone: userForm.phone,
          role: "user",
          status: "non-verified",
          asset: userForm.asset,
        },
      ])
      .select("id")
      .single();

    const { data: assetData } = await supabase
      .from("assets")
      .insert([
        {
          user_id: userData.id,
          asset_name: userForm.asset,
          issued_date: new Date().toISOString().split("T")[0],
          status: "non-verified",
        },
      ])
      .select("id")
      .single();

    const docs = userForm.documents
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (assetData?.id && docs.length > 0) {
      const docRows = docs.map((d) => ({
        asset_id: assetData.id,
        document_name: d,
        is_uploaded: false,
      }));
      await supabase.from("required_documents").insert(docRows);
    }

    alert("✅ User, asset, and documents added!");
    fetchUsers();
    setUserForm({ name: "", phone: "", asset: "", documents: "" });
  };

  // ✅ Excel Upload via Drag & Drop
  const handleExcelDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await processExcel(file);
  };

  // ✅ Shared Excel Parser
  const processExcel = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      for (const row of sheet as any[]) {
        const { name, phone, asset_name, documents } = row;
        if (!name || !phone || !asset_name) continue;

        const { data: userData } = await supabase
          .from("users")
          .insert([
            { name, phone, role: "user", status: "non-verified", asset: asset_name },
          ])
          .select("id")
          .single();

        const { data: assetData } = await supabase
          .from("assets")
          .insert([
            {
              user_id: userData.id,
              asset_name,
              issued_date: new Date().toISOString().split("T")[0],
              status: "non-verified",
            },
          ])
          .select("id")
          .single();

        if (assetData?.id && documents) {
          const docList = documents
            .split(",")
            .map((d: string) => d.trim())
            .filter(Boolean)
            .map((d: string) => ({
              asset_id: assetData.id,
              document_name: d,
              is_uploaded: false,
            }));
          await supabase.from("required_documents").insert(docList);
        }
      }

      alert("✅ Excel upload complete!");
      fetchUsers();
    };
    reader.readAsArrayBuffer(file);
  };

  // ✅ Pagination controls for image preview
  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % assetImages.length);
  };
  const handlePrevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + assetImages.length) % assetImages.length
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-green-100 to-green-200">
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white shadow-md sticky top-0 z-10"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-green-600" />
            <h1 className="text-xl font-bold text-green-600">
              AuthenX Loan Manager
            </h1>
          </div>
          <Button
            onClick={onLogout}
            className="bg-gradient-to-r from-green-500 to-green-700 text-white px-4 rounded-full"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="add">Add New</TabsTrigger>
          </TabsList>

          {/* USERS TAB */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-1/2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 rounded-xl bg-white shadow-sm"
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="non-verified">Non-Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="authenticated">Authenticated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <p className="text-center text-gray-500">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-gray-500">No users found</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredUsers.map((user) => (
                  <Card
                    key={user.id}
                    onClick={() => handleUserClick(user)}
                    className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition cursor-pointer"
                  >
                    <h3 className="font-semibold">{user.name}</h3>
                    <p className="text-sm text-gray-600">{user.phone}</p>
                    <p className="text-sm text-gray-500">Asset: {user.asset}</p>
                    <p
                      className={`text-xs font-bold mt-2 ${
                        user.status === "authenticated"
                          ? "text-green-600"
                          : user.status === "pending"
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {user.status}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ADD USER TAB */}
          <TabsContent value="add">
            <div className="space-y-6">
              {/* Manual Add Section */}
              <Card className="p-6 bg-white rounded-2xl shadow">
                <h2 className="text-lg font-semibold mb-4 text-green-700">
                  ➕ Add User Manually
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={userForm.name}
                      onChange={(e) =>
                        setUserForm({ ...userForm, name: e.target.value })
                      }
                      placeholder="Enter full name"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={userForm.phone}
                      onChange={(e) =>
                        setUserForm({ ...userForm, phone: e.target.value })
                      }
                      placeholder="Enter phone number"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Asset</Label>
                    <Input
                      value={userForm.asset}
                      onChange={(e) =>
                        setUserForm({ ...userForm, asset: e.target.value })
                      }
                      placeholder="Enter asset name (e.g. Tractor Loan)"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Documents (comma separated)</Label>
                    <Input
                      value={userForm.documents}
                      onChange={(e) =>
                        setUserForm({ ...userForm, documents: e.target.value })
                      }
                      placeholder="Aadhaar, Land Proof, Income Certificate"
                      className="mt-1"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddUser}
                  className="mt-6 bg-green-600 text-white hover:bg-green-700"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Add User
                </Button>
              </Card>

              {/* Excel Upload Section */}
              <Card className="p-6 bg-white rounded-2xl shadow">
                <h2 className="text-lg font-semibold mb-4 text-green-700">
                  📊 Bulk Upload via Excel
                </h2>

                {/* Drag & Drop */}
                <div
                  onDrop={handleExcelDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-green-400 rounded-xl p-10 text-center text-gray-500 hover:bg-green-50 transition"
                >
                  <Upload className="mx-auto w-8 h-8 text-green-600 mb-2" />
                  <p>Drag & drop Excel file here</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Columns: name, phone, asset_name, documents
                  </p>
                </div>

                {/* Upload via Button */}
                <div className="flex flex-col items-center mt-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    id="excelFileInput"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) processExcel(file);
                    }}
                  />
                  <Button
                    onClick={() =>
                      document.getElementById("excelFileInput")?.click()
                    }
                    className="mt-2 bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Upload Excel File
                  </Button>
                </div>

                <div className="flex justify-end mt-4">
                  <Button
                    onClick={handleDownloadSample}
                    variant="outline"
                    className="flex items-center gap-2 border-green-500 text-green-600 hover:bg-green-50"
                  >
                    <Download className="w-4 h-4" />
                    Download Sample Excel
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* POPUP */}
      {selectedUser && assetDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-11/12 max-w-2xl p-6 relative overflow-y-auto max-h-[90vh]">
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-black"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-green-700 mb-3">
              User Details
            </h2>
            <p><strong>Name:</strong> {selectedUser.name}</p>
            <p><strong>Phone:</strong> {selectedUser.phone}</p>
            <p><strong>Asset:</strong> {assetDetails.asset_name}</p>
            <p><strong>Issued Date:</strong> {assetDetails.issued_date}</p>
            <p><strong>Status:</strong> {assetDetails.status}</p>

            <h3 className="mt-4 font-semibold">Required Documents:</h3>
            <ul className="list-disc ml-6">
              {assetDetails.documents.map((doc: any, i: number) => (
                <li key={i}>
                  {doc.document_name}{" "}
                  <span className="text-xs text-gray-500">
                    {doc.is_uploaded ? "✅ Uploaded" : "❌ Pending"}
                  </span>
                </li>
              ))}
            </ul>

            {assetDetails.status === "pending" && (
              <>
                <h3 className="mt-4 font-semibold">Uploaded Images:</h3>
                <div className="flex items-center justify-center relative mt-3">
                  {assetImages.length > 0 && (
                    <>
                      <img
                        src={assetImages[currentImageIndex]}
                        alt="doc"
                        className="rounded-lg max-h-80 w-full object-contain shadow-md"
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
                    </>
                  )}
                </div>
              </>
            )}

            {assetDetails.status === "pending" && (
              <div className="flex justify-between mt-6">
                {processing ? (
                  <div className="flex items-center justify-center w-full text-green-600">
                    <Loader2 className="animate-spin w-5 h-5 mr-2" />
                    <p>Updating status...</p>
                  </div>
                ) : (
                  <>
                    <Button
                      onClick={() => handleStatusUpdate("authenticated")}
                      className="bg-green-100 text-green-700 hover:bg-green-200 w-[48%]"
                    >
                      ✅ Grant
                    </Button>
                    <Button
                      onClick={() => handleStatusUpdate("non-verified")}
                      className="bg-red-100 text-red-700 hover:bg-red-200 w-[48%]"
                    >
                      ❌ Non-Grant
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

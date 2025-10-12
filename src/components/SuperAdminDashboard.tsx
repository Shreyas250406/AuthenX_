import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Shield,
  Search,
  Users,
  LogOut,
  Download,
  UserPlus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../supabaseClient";

interface Bank {
  id: string;
  name: string;
  branch: string;
  branch_manager: string;
  loan_manager?: { name: string; phone: string } | null;
}

export function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState<"bank" | "superadmin">("bank");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [activeTab, setActiveTab] = useState("banks"); // ✅ track active tab

  const [bankForm, setBankForm] = useState({
    name: "",
    branch: "",
    branch_manager: "",
    loanManagerName: "",
    loanManagerPhone: "",
  });

  const [superAdminForm, setSuperAdminForm] = useState({ name: "", phone: "" });

  const [totalUsers, setTotalUsers] = useState(0);
  const [totalLoanManagers, setTotalLoanManagers] = useState(0);
  const [totalSuperAdmins, setTotalSuperAdmins] = useState(0);

  const weeklyData = [
    { day: "Mon", logins: 45 },
    { day: "Tue", logins: 52 },
    { day: "Wed", logins: 38 },
    { day: "Thu", logins: 65 },
    { day: "Fri", logins: 58 },
    { day: "Sat", logins: 30 },
    { day: "Sun", logins: 25 },
  ];

  const filteredBanks = banks.filter((bank) =>
    bank.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ Fetch banks from Supabase
  const fetchBanks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("banks")
      .select(`id, name, branch, branch_manager, users(name, phone, role)`);

    if (!error) {
      const formattedBanks = (data || []).map((bank: any) => {
        const lm = bank.users?.find((u: any) => u.role === "loanmanager");
        return {
          id: bank.id,
          name: bank.name,
          branch: bank.branch,
          branch_manager: bank.branch_manager,
          loan_manager: lm ? { name: lm.name, phone: lm.phone } : null,
        };
      });
      setBanks(formattedBanks);
    }
    setLoading(false);
  };

  // ✅ Fetch overall counts
  const fetchCounts = async () => {
    const { count: usersCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "user");
    setTotalUsers(usersCount || 0);

    const { count: lmCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "loanmanager");
    setTotalLoanManagers(lmCount || 0);

    const { count: saCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "superadmin");
    setTotalSuperAdmins(saCount || 0);
  };

  useEffect(() => {
    fetchBanks();
    fetchCounts();
  }, []);

  // ✅ Add Bank (and show immediately)
  const handleAddBank = async () => {
    if (
      !bankForm.name ||
      !bankForm.branch ||
      !bankForm.branch_manager ||
      !bankForm.loanManagerName ||
      !bankForm.loanManagerPhone
    ) {
      alert("⚠️ Please fill all fields before adding a bank");
      return;
    }

    const { data: bankData, error: bankError } = await supabase
      .from("banks")
      .insert([
        {
          name: bankForm.name,
          branch: bankForm.branch,
          branch_manager: bankForm.branch_manager,
        },
      ])
      .select("id")
      .single();

    if (bankError) return alert("❌ " + bankError.message);

    await supabase.from("users").insert([
      {
        name: bankForm.loanManagerName,
        phone: bankForm.loanManagerPhone,
        role: "loanmanager",
        bank_id: bankData.id,
        status: "authenticated",
      },
    ]);

    // ✅ Refresh Banks Immediately
    await fetchBanks();

    // ✅ Auto-switch back to Banks tab
    setActiveTab("banks");

    alert(`✅ Bank Added: ${bankForm.name}`);

    // Reset form
    setBankForm({
      name: "",
      branch: "",
      branch_manager: "",
      loanManagerName: "",
      loanManagerPhone: "",
    });
  };

  // ✅ Add Super Admin
  const handleAddSuperAdmin = async () => {
    if (!superAdminForm.name || !superAdminForm.phone) {
      alert("⚠️ Please fill all fields");
      return;
    }

    const { error } = await supabase.from("users").insert([
      {
        name: superAdminForm.name,
        phone: superAdminForm.phone,
        role: "superadmin",
        status: "authenticated",
      },
    ]);

    if (error) return alert("❌ " + error.message);

    alert(`✅ Super Admin Added: ${superAdminForm.name}`);
    setSuperAdminForm({ name: "", phone: "" });
  };

  // ✅ Download Banks as CSV
  const handleDownloadBanks = () => {
    const csv = [
      ["ID", "Name", "Branch", "Branch Manager", "Loan Manager Name", "Loan Manager Phone"],
      ...banks.map((b) => [
        b.id,
        b.name,
        b.branch,
        b.branch_manager,
        b.loan_manager?.name || "N/A",
        b.loan_manager?.phone || "N/A",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "banks.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200">
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white shadow-md sticky top-0 z-10"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-blue-600">
              AuthenX Super Admin
            </h1>
          </div>
          <Button
            onClick={onLogout}
            className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-4 rounded-full"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="banks">Banks</TabsTrigger>
            <TabsTrigger value="add">Add New</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Banks Tab */}
          <TabsContent value="banks" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="relative w-1/2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search banks by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 rounded-xl bg-white shadow-sm"
                />
              </div>
              <Button
                onClick={handleDownloadBanks}
                className="bg-gradient-to-r from-blue-500 to-blue-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" /> Download Banks
              </Button>
            </div>

            {loading ? (
              <p className="text-center text-gray-500">Loading banks...</p>
            ) : filteredBanks.length === 0 ? (
              <p className="text-center text-gray-500">No banks found</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredBanks.map((bank) => (
                  <Card
                    key={bank.id}
                    className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition cursor-pointer"
                    onClick={() => setSelectedBank(bank)}
                  >
                    <h3 className="font-semibold">{bank.name}</h3>
                    <p className="text-sm text-gray-600">
                      Branch: {bank.branch}
                    </p>
                    <p className="text-sm text-gray-500">
                      Manager: {bank.branch_manager}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Add Tab */}
          <TabsContent value="add" className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <Label>Add New</Label>
              <Select
                value={addType}
                onValueChange={(value) => setAddType(value as "bank" | "superadmin")}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-lg rounded-lg">
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="superadmin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {addType === "bank" ? (
              <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
                <Label>Bank Name</Label>
                <Input
                  placeholder="e.g., State Bank of India"
                  value={bankForm.name}
                  onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                />
                <Label>Branch</Label>
                <Input
                  placeholder="e.g., Mumbai Central"
                  value={bankForm.branch}
                  onChange={(e) => setBankForm({ ...bankForm, branch: e.target.value })}
                />
                <Label>Branch Manager</Label>
                <Input
                  placeholder="e.g., Rajesh Kumar"
                  value={bankForm.branch_manager}
                  onChange={(e) =>
                    setBankForm({ ...bankForm, branch_manager: e.target.value })
                  }
                />
                <Label>Loan Manager Name</Label>
                <Input
                  placeholder="e.g., Amit Sharma"
                  value={bankForm.loanManagerName}
                  onChange={(e) =>
                    setBankForm({ ...bankForm, loanManagerName: e.target.value })
                  }
                />
                <Label>Loan Manager Phone</Label>
                <Input
                  placeholder="+91 98765 43210"
                  value={bankForm.loanManagerPhone}
                  onChange={(e) =>
                    setBankForm({ ...bankForm, loanManagerPhone: e.target.value })
                  }
                />
                <Button
                  onClick={handleAddBank}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-700"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Add Bank
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
                <Label>Super Admin Name</Label>
                <Input
                  placeholder="e.g., John Doe"
                  value={superAdminForm.name}
                  onChange={(e) =>
                    setSuperAdminForm({ ...superAdminForm, name: e.target.value })
                  }
                />
                <Label>Super Admin Phone</Label>
                <Input
                  placeholder="+91 98765 43210"
                  value={superAdminForm.phone}
                  onChange={(e) =>
                    setSuperAdminForm({ ...superAdminForm, phone: e.target.value })
                  }
                />
                <Button
                  onClick={handleAddSuperAdmin}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-700"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Add Super Admin
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-6 bg-white border rounded-2xl shadow-sm">
                <Users className="w-8 h-8 text-blue-500 mb-2" />
                <div className="text-3xl font-bold">{banks.length}</div>
                <p className="text-gray-500">Total Banks</p>
              </Card>
              <Card className="p-6 bg-white border rounded-2xl shadow-sm">
                <Users className="w-8 h-8 text-purple-500 mb-2" />
                <div className="text-3xl font-bold">{totalUsers}</div>
                <p className="text-gray-500">Total Users</p>
              </Card>
              <Card className="p-6 bg-white border rounded-2xl shadow-sm">
                <Users className="w-8 h-8 text-green-500 mb-2" />
                <div className="text-3xl font-bold">{totalLoanManagers}</div>
                <p className="text-gray-500">Loan Managers</p>
              </Card>
              <Card className="p-6 bg-white border rounded-2xl shadow-sm">
                <Users className="w-8 h-8 text-pink-500 mb-2" />
                <div className="text-3xl font-bold">{totalSuperAdmins}</div>
                <p className="text-gray-500">Super Admins</p>
              </Card>
            </div>

            <Card className="p-6 bg-white">
              <h3 className="mb-4 font-semibold text-gray-900">Weekly Logins</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="logins" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ✅ Bank Details Popup */}
      <AlertDialog
        open={!!selectedBank}
        onOpenChange={(open) => !open && setSelectedBank(null)}
      >
        <AlertDialogContent className="bg-white rounded-2xl shadow-xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Bank Details
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-4">
                <p>
                  <b>ID:</b> {selectedBank?.id}
                </p>
                <p>
                  <b>Name:</b> {selectedBank?.name}
                </p>
                <p>
                  <b>Branch:</b> {selectedBank?.branch}
                </p>
                <p>
                  <b>Manager:</b> {selectedBank?.branch_manager}
                </p>
                <p>
                  <b>Loan Manager:</b>{" "}
                  {selectedBank?.loan_manager
                    ? `${selectedBank.loan_manager.name} (${selectedBank.loan_manager.phone})`
                    : "Not Assigned"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { SplashScreen } from "./components/SplashScreen";
import { LoginScreen } from "./components/LoginScreen";
import { OTPScreen } from "./components/OTPScreen";
import { SuperAdminDashboard } from "./components/SuperAdminDashboard";
import { BankAdminDashboard } from "./components/BankAdminDashboard";
import { UserDashboard } from "./components/UserDashboard";
import { Toaster } from "./components/ui/sonner";
import { supabase } from "./supabaseClient";

type AppState = "splash" | "login" | "otp" | "dashboard";
type UserRole = "superadmin" | "loanmanager" | "user";

export default function App() {
  const [appState, setAppState] = useState<AppState>("splash");
  const [phone, setPhone] = useState("");
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // 🔹 Splash → Login
  const handleSplashComplete = () => setAppState("login");

  // ---------- SEND OTP ----------
  const handleLogin = async (phoneNumberRaw: string) => {
    try {
      let phoneNumber = String(phoneNumberRaw || "").trim();
      phoneNumber = phoneNumber.replace(/[^\d+]/g, "");

      if (!phoneNumber.startsWith("+")) {
        phoneNumber = "+91" + phoneNumber;
      }

      const e164 = /^\+\d{7,15}$/;
      if (!e164.test(phoneNumber)) {
        alert("Invalid phone number. Example: +919876543210");
        return;
      }

      setPhone(phoneNumber);

      const { error } = await supabase.auth.signInWithOtp({ phone: phoneNumber });

      if (error) {
        console.error("❌ Supabase OTP send error:", error.message);
        alert("OTP send failed: " + error.message);
        return;
      }

      console.log("✅ Supabase OTP sent to:", phoneNumber);
      setAppState("otp");
    } catch (err: any) {
      console.error("❌ OTP send error:", err.message);
      alert("OTP send failed: " + err.message);
    }
  };

  // ---------- VERIFY OTP ----------
  const handleOTPVerify = async (otp: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });

      if (error) {
        console.error("❌ OTP verification failed:", error.message);
        alert("OTP verification failed: " + error.message);
        return;
      }

      console.log("✅ Verified user:", data.user);

      // Normalize phone
      let normalizedPhone = phone.replace(/[^\d+]/g, "");
      if (!normalizedPhone.startsWith("+")) normalizedPhone = "+91" + normalizedPhone;

      // Fetch role
      const { data: userData, error: roleError } = await supabase
        .from("users")
        .select("role")
        .eq("phone", normalizedPhone)
        .single();

      if (roleError) {
        console.warn("⚠️ Role not found, defaulting to 'user':", roleError.message);
        setUserRole("user");
      } else {
        console.log("ℹ️ Role from DB:", userData?.role);
        setUserRole((userData?.role as UserRole) || "user");
      }

      setAppState("dashboard");
    } catch (err: any) {
      console.error("❌ OTP verification failed:", err.message);
      alert("OTP verification failed: " + err.message);
    }
  };

  // ---------- LOGOUT ----------
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAppState("login");
    setPhone("");
    setUserRole(null);
  };

  // ---------- BACK ----------
  const handleBackToLogin = () => {
    setAppState("login");
    setPhone("");
  };

  return (
    <>
      {appState === "splash" && <SplashScreen onComplete={handleSplashComplete} />}

      {appState === "login" && <LoginScreen onLogin={handleLogin} />}

      {appState === "otp" && (
        <OTPScreen onVerify={handleOTPVerify} onBack={handleBackToLogin} phone={phone} />
      )}

      {/* ---------- DASHBOARD ROUTES ---------- */}
      {appState === "dashboard" && userRole === "superadmin" && (
        <SuperAdminDashboard onLogout={handleLogout} />
      )}

      {appState === "dashboard" && userRole === "loanmanager" && (
        <BankAdminDashboard onLogout={handleLogout} />
      )}

      {appState === "dashboard" && userRole === "user" && (
        // ✅ FIX: Pass phone to UserDashboard
        <UserDashboard onLogout={handleLogout} phone={phone} />
      )}

      <Toaster />
    </>
  );
}

import { useState } from "react";
import { supabase } from "../supabaseClient";

interface LoginScreenProps {
  onLogin: (phoneNumber: string) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanPhone = phone.replace(/\s+/g, "");
    if (!cleanPhone.match(/^\+?\d{10,15}$/)) {
      setError("Please enter a valid phone number.");
      return;
    }

    try {
      setLoading(true);

      // ✅ Check if user exists in Supabase users table
      const { data, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("phone", cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`)
        .single();

      if (userError || !data) {
        setError("This phone number is not registered.");
        setLoading(false);
        return;
      }

      // ✅ Proceed to OTP screen if user exists
      onLogin(cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`);
    } catch (err) {
      console.error("❌ Error checking user:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-2xl font-bold text-indigo-600">AuthenX</h1>
          </div>
          <p className="text-sm text-gray-500">Authenticity. Verified.</p>
        </div>

        {/* Card Content */}
        <h2 className="text-xl font-semibold text-center mb-2">Welcome Back</h2>
        <p className="text-center text-gray-500 mb-6">Login to continue</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-600 mb-1">Phone Number</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400">📞</span>
              <input
                type="tel"
                placeholder="Enter phone (e.g. 9876543210)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-2 rounded-lg font-semibold transition ${
              loading ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            {loading ? "Checking..." : "Send OTP"}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-4">
          We'll send you an OTP if your number is registered
        </p>
      </div>
    </div>
  );
}

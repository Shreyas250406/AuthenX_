import { useState, useRef, useEffect } from "react";

interface OTPScreenProps {
  onVerify: (otp: string) => void;
  onBack: () => void;
  phone: string;
  onResend?: () => void;
}

export function OTPScreen({ onVerify, onBack, phone, onResend }: OTPScreenProps) {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // focus first input when component mounts
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^[0-9]?$/.test(value)) return; // only numbers 0-9 or empty
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Move to next input automatically
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length === 6) {
      console.log("OTPScreen: submitting OTP:", code);
      onVerify(code);
    } else {
      alert("Please enter the 6-digit OTP.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            ← Back
          </button>
        </div>

        <h2 className="text-xl font-semibold text-center mb-2">Enter OTP</h2>
        <p className="text-center text-gray-500 mb-6">
          We've sent a code to <span className="font-medium">{phone}</span>
        </p>

        {/* OTP Inputs */}
        <form onSubmit={handleSubmit} className="flex flex-col items-center space-y-6">
          <div className="flex space-x-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                inputMode="numeric"
                pattern="[0-9]*"
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-12 text-center border rounded-lg text-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ))}
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-2 rounded-lg font-semibold hover:opacity-90 transition"
          >
            Verify OTP
          </button>
        </form>

        {/* Resend */}
        <p className="text-sm text-center text-gray-500 mt-4">
          Didn’t get the code?{" "}
          <button
            type="button"
            onClick={() => {
              if (onResend) {
                console.log("OTPScreen: resend clicked for", phone);
                onResend();
              } else {
                console.warn("OTPScreen: onResend not provided");
              }
            }}
            className="text-indigo-600 hover:underline"
          >
            Resend OTP
          </button>
        </p>
      </div>
    </div>
  );
}

import { motion } from 'motion/react';
import { Shield } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ 
          duration: 0.6,
          ease: [0.34, 1.56, 0.64, 1] // Bounce easing
        }}
      >
        <motion.div
          animate={{ 
            y: [0, 0, -250] // Stay for 2s then move up
          }}
          transition={{
            duration: 2.5,
            times: [0, 0.8, 1],
            ease: "easeInOut"
          }}
          onAnimationComplete={onComplete}
          className="flex flex-col items-center gap-4"
        >
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-8 rounded-3xl shadow-2xl">
            <Shield className="w-20 h-20 text-white" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AuthenX
            </h1>
            <p className="text-gray-600 mt-2">Authenticity. Verified.</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

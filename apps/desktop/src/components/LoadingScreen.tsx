import { motion } from "motion/react";
import headerLogo from "../assets/logos/header-logo.png";

// Startup splash shown while useAccount() resolves the stored session
// (see App.tsx) — AnimatePresence there handles the fade-out once
// accountLoading flips to false, this only owns the enter/idle animation.
export default function LoadingScreen() {
  return (
    <motion.div
      className="loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <motion.div
        className="loading-screen__glow"
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.img
        src={headerLogo}
        alt=""
        className="loading-screen__logo"
        initial={{ opacity: 0, scale: 0.85, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      <div className="loading-screen__bar">
        <motion.div
          className="loading-screen__bar-fill"
          animate={{ x: ["-100%", "260%"] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.p
        className="loading-screen__label"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        Loading
      </motion.p>
    </motion.div>
  );
}

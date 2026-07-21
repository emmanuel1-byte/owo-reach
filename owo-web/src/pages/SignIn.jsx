import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STITCH_IMAGES } from "../lib/images.js";
import { Checkbox } from "../components/ui/checkbox.jsx";

export default function SignIn() {
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  function submit(e) {
    e.preventDefault();
    const pw = e.target.password.value;
    // Direct inline error voice — never a modal, never an apology.
    if (pw === "reach2024") navigate("/home");
    else setError(true);
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left: Stitch stock photograph (Lagos office), deep-teal wash + overlay */}
      <section className="relative hidden lg:block bg-ink overflow-hidden">
        <img
          src={STITCH_IMAGES.signin}
          alt="A professional financial operations team in a modern Lagos office"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-10">
          <div className="wordmark text-[15px] text-white">OWÓ&nbsp;REACH</div>
          <span className="label-caps text-white/60">Ops console</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-12">
          <h1 className="font-display text-white text-[40px] leading-[1.1] font-semibold mb-3">
            Accountability and proof, not gloss.
          </h1>
          <p className="font-display text-white/85 text-[22px]">Did everyone get paid?</p>
        </div>
      </section>

      {/* Right: sign-in form */}
      <section className="flex items-center justify-center px-6 sm:px-10 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden wordmark text-[15px] text-ink mb-10">OWÓ&nbsp;REACH</div>

          <h2 className="font-display text-heading font-semibold text-ink mb-2">Welcome back</h2>
          <p className="text-[14px] text-ink-soft mb-9">
            Single admin session. This console runs on sandbox rails.
          </p>

          <form onSubmit={submit} noValidate className="space-y-5">
            <div>
              <label className="field-label" htmlFor="email">Email or username</label>
              <input
                className="field"
                id="email"
                name="email"
                type="email"
                placeholder="admin@oworeach.com"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input
                className="field"
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                onChange={() => error && setError(false)}
                required
              />
              {error && (
                <p className="mt-2 text-[13px] text-state-failed">
                  That password does not match. Try again.
                </p>
              )}
              <label className="flex items-center gap-2 mt-3 text-[13px] text-ink-soft select-none cursor-pointer">
                <Checkbox checked={showPw} onCheckedChange={setShowPw} />
                Show password
              </label>
            </div>

            <button type="submit" className="btn btn-primary w-full !py-3">
              Sign in
            </button>
          </form>

          <p className="mt-8 text-[13px] text-ink-soft">
            New organisation on Owó Reach?{" "}
            <Link to="/signup" className="text-ink font-medium underline underline-offset-2 hover:text-reach">
              Create an account
            </Link>
          </p>

          <p className="mt-10 text-[12px] text-ink-soft/80 leading-relaxed">
            Built for the Monnify Developer Challenge. Sandbox only — simulated SMS is
            labelled in the app. <span className="mono">(try password: reach2024)</span>
          </p>
        </div>
      </section>
    </main>
  );
}

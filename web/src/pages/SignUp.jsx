import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STITCH_IMAGES } from "../lib/images.js";
import { Checkbox } from "../components/ui/checkbox.jsx";

export default function SignUp() {
  const [showPw, setShowPw] = useState(false);
  const [score, setScore] = useState(0);
  const [agree, setAgree] = useState(false);
  const navigate = useNavigate();

  function onPw(e) {
    const v = e.target.value;
    let s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    setScore(s);
  }

  function submit(e) {
    e.preventDefault();
    if (agree) navigate("/home");
  }

  const meterColors = ["#9C3B2E", "#C4701C", "#B5883C", "#0C7D5C"];

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left: Stitch stock photograph (Nigerian marketplace) */}
      <section className="relative hidden lg:block bg-ink overflow-hidden">
        <img
          src={STITCH_IMAGES.signup}
          alt="A modern Nigerian marketplace with people transacting"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-10">
          <div className="wordmark text-[15px] text-white">OWÓ&nbsp;REACH</div>
          <span className="label-caps text-white/60">Ops console</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-12">
          <h1 className="font-display text-white text-[36px] leading-[1.15] font-semibold">
            Payroll for the informal economy. One list in, everyone paid.
          </h1>
        </div>
      </section>

      {/* Right: registration form */}
      <section className="flex items-center justify-center px-6 sm:px-10 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden wordmark text-[15px] text-ink mb-10">OWÓ&nbsp;REACH</div>

          <h2 className="font-display text-heading font-semibold text-ink mb-2">Create account</h2>
          <p className="text-[14px] text-ink-soft mb-9">
            Set up your organisation's payout console. Takes under a minute.
          </p>

          <form onSubmit={submit} noValidate className="space-y-5">
            <div>
              <label className="field-label" htmlFor="org">Organisation name</label>
              <input className="field" id="org" name="org" type="text" placeholder="Green Harvest Co-op" autoComplete="organization" required />
            </div>
            <div>
              <label className="field-label" htmlFor="email">Work email</label>
              <input className="field" id="email" name="email" type="email" placeholder="admin@oworeach.com" autoComplete="email" required />
            </div>
            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input
                className="field"
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                onChange={onPw}
                required
              />
              <div className="mt-2 h-1 w-full bg-hairline rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${(score / 4) * 100}%`,
                    background: meterColors[Math.max(0, score - 1)],
                  }}
                />
              </div>
              <label className="flex items-center gap-2 mt-3 text-[13px] text-ink-soft select-none cursor-pointer">
                <Checkbox checked={showPw} onCheckedChange={setShowPw} />
                Show password
              </label>
            </div>

            <label className="flex items-start gap-2 text-[13px] text-ink-soft select-none cursor-pointer">
              <Checkbox className="mt-0.5" checked={agree} onCheckedChange={setAgree} required />
              <span>
                I understand this is a sandbox environment and simulated SMS is labelled in
                the app.
              </span>
            </label>

            <button type="submit" className="btn btn-primary w-full !py-3">
              Sign up
            </button>
          </form>

          <p className="mt-8 text-[13px] text-ink-soft">
            Already have an account?{" "}
            <Link to="/" className="text-ink font-medium underline underline-offset-2 hover:text-reach">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

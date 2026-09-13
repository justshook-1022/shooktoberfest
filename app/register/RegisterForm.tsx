"use client";

import { useEffect, useState } from "react";
import PlayerAvatar from "../../components/PlayerAvatar";
import { event } from "../../lib/event";
import { getProfilePhotoUrl } from "../../lib/profile-photo";
import { createProfilePhotoBlob, DEFAULT_PROFILE_PHOTO_CROP } from "../../lib/profile-photo-crop";
import { getBrowserClient } from "../../lib/supabase/client";
import ProfilePhotoCropper from "./ProfilePhotoCropper";

const sizes = ["S", "M", "L", "XL", "2XL", "3XL"];

export type RegistrationProfile = {
  first_name: string;
  last_name: string;
  phone: string | null;
  handicap_id: string | null;
  handicap_index: number | null;
  shirt_size: string;
  wife_attending: boolean;
  wife_name: string | null;
  wife_shirt_size: string | null;
  profile_photo_path: string | null;
  payment_status: string;
};

export default function RegisterForm({
  email,
  initialProfile,
}: {
  email: string;
  initialProfile: RegistrationProfile | null;
}) {
  const initialStep = initialProfile?.profile_photo_path ? 3 : initialProfile ? 2 : 1;
  const [step, setStep] = useState(initialStep);
  const [wife, setWife] = useState(initialProfile?.wife_attending ?? false);
  const [busy, setBusy] = useState<"profile" | "photo" | "payment" | null>(null);
  const [error, setError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoCrop, setPhotoCrop] = useState(DEFAULT_PROFILE_PHOTO_CROP);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [preview, setPreview] = useState(() => getProfilePhotoUrl(initialProfile?.profile_photo_path));
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => () => {
    if (cropSource?.startsWith("blob:")) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  async function saveProfile(formData: FormData) {
    setBusy("profile");
    setError("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, wife_attending: wife }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your golfer profile could not be saved.");
      setProfile(current => ({
        first_name: String(payload.first_name),
        last_name: String(payload.last_name),
        phone: String(payload.phone || "") || null,
        handicap_id: String(payload.handicap_id).trim().toUpperCase(),
        handicap_index: payload.handicap_index ? Number(payload.handicap_index) : null,
        shirt_size: String(payload.shirt_size),
        wife_attending: wife,
        wife_name: wife ? String(payload.wife_name || "") : null,
        wife_shirt_size: wife ? String(payload.wife_shirt_size || "") : null,
        profile_photo_path: current?.profile_photo_path ?? null,
        payment_status: current?.payment_status ?? "unpaid",
      }));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your golfer profile could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Choose a photo smaller than 12 MB.");
      return;
    }
    setSelectedPhoto(file);
    setPhotoCrop(DEFAULT_PROFILE_PHOTO_CROP);
    setCropSource(URL.createObjectURL(file));
    setError("");
  }

  async function savePhoto() {
    if (!selectedPhoto && profile?.profile_photo_path) {
      setStep(3);
      return;
    }
    if (!selectedPhoto) {
      setError("Choose a profile photo to continue.");
      return;
    }

    setBusy("photo");
    setError("");
    try {
      const client = getBrowserClient();
      if (!client) throw new Error("Photo uploads are temporarily unavailable.");
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error("Sign in again before uploading your photo.");

      const image = await createProfilePhotoBlob(selectedPhoto, photoCrop);
      const path = `${auth.user.id}/avatar.jpg`;
      const { error: uploadError } = await client.storage.from("profile-photos").upload(path, image, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const response = await fetch("/api/register/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const result = await response.json() as { error?: string; profilePhotoPath?: string };
      if (!response.ok || !result.profilePhotoPath) {
        throw new Error(result.error || "Your photo could not be saved.");
      }

      setProfile(current => current ? { ...current, profile_photo_path: result.profilePhotoPath! } : current);
      setPreview(URL.createObjectURL(image));
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your photo could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function openCheckout() {
    setBusy("payment");
    setError("");
    try {
      const response = await fetch("/api/register/checkout", { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not open.");
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not open. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="registration-flow">
      <ol className="onboarding-progress" aria-label="Account setup progress">
        {["Handicap ID", "Profile photo", "Payment"].map((label, index) => {
          const number = index + 1;
          return <li key={label} className={step === number ? "active" : step > number ? "complete" : ""}><span>{step > number ? "✓" : number}</span><small>{label}</small></li>;
        })}
      </ol>

      {step === 1 ? (
        <form className="registration-form" onSubmit={event => { event.preventDefault(); void saveProfile(new FormData(event.currentTarget)); }}>
          <div className="form-section">
            <span className="form-number">01</span>
            <div><h2>Golfer & handicap</h2><p>Connect your official handicap record and tell us who is playing.</p></div>
          </div>
          <label className="handicap-id-field">Handicap ID <small>Your GHIN or club handicap identifier</small><input name="handicap_id" required minLength={3} maxLength={32} pattern="[A-Za-z0-9 -]+" autoCapitalize="characters" defaultValue={profile?.handicap_id ?? ""} placeholder="1234567" /></label>
          <div className="form-grid two form-grid-spaced">
            <label>First name<input name="first_name" autoComplete="given-name" required defaultValue={profile?.first_name ?? ""} /></label>
            <label>Last name<input name="last_name" autoComplete="family-name" required defaultValue={profile?.last_name ?? ""} /></label>
          </div>
          <div className="form-grid two">
            <label>Email<input name="email" type="email" value={email} readOnly aria-describedby="email-note" /><small id="email-note">From your signed-in account</small></label>
            <label>Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} /></label>
          </div>
          <div className="form-grid two">
            <label>Current handicap index <small>Optional · whole number</small><input name="handicap_index" type="number" inputMode="numeric" step="1" min="-10" max="60" defaultValue={profile?.handicap_index ?? ""} /></label>
            <label>Shirt size<select name="shirt_size" required defaultValue={profile?.shirt_size ?? "L"}>{sizes.map(size => <option key={size}>{size}</option>)}</select></label>
          </div>

          <div className="form-section form-section-spaced">
            <span className="form-number">+</span>
            <div><h2>Guest</h2><p>Spouse or guest joining after the round.</p></div>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={wife} onChange={event => setWife(event.target.checked)} />
            <span className="toggle" aria-hidden="true" />
            Yes, I&apos;m bringing a guest
          </label>
          {wife ? (
            <div className="form-grid two guest-fields">
              <label>Guest name<input name="wife_name" required defaultValue={profile?.wife_name ?? ""} /></label>
              <label>Guest shirt size<select name="wife_shirt_size" required defaultValue={profile?.wife_shirt_size ?? "M"}>{sizes.map(size => <option key={size}>{size}</option>)}</select></label>
            </div>
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary form-submit" disabled={busy !== null}>
            {busy === "profile" ? "Saving…" : "Save & add photo"}
          </button>
        </form>
      ) : null}

      {step === 2 ? (
        <section className="registration-form onboarding-photo-step">
          <div className="form-section">
            <span className="form-number">02</span>
            <div><h2>Add your profile photo</h2><p>This is the photo teammates will see on the leaderboard and scorecard.</p></div>
          </div>
          <div className={`profile-photo-picker${selectedPhoto ? " is-editing" : ""}`}>
            {selectedPhoto && cropSource
              ? <ProfilePhotoCropper src={cropSource} crop={photoCrop} onChange={setPhotoCrop} />
              : <PlayerAvatar name={`${profile?.first_name ?? "Golfer"} ${profile?.last_name ?? ""}`} src={preview} size="large" />}
            <div className="profile-photo-choice">
              <label className="button button-secondary profile-photo-button">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choosePhoto(event.target.files?.[0])} />
                {preview || cropSource ? "Choose a different photo" : "Choose a photo"}
              </label>
              <p>{selectedPhoto ? "The circular guide matches how your photo will appear around the site." : "JPG, PNG, or WebP up to 12 MB."}</p>
            </div>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="onboarding-actions">
            <button className="text-link" type="button" onClick={() => { setError(""); setStep(1); }}>← Edit golfer details</button>
            <button className="button button-primary" type="button" onClick={() => void savePhoto()} disabled={busy !== null}>
              {busy === "photo" ? "Uploading…" : "Save photo & continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="registration-form onboarding-payment-step">
          <div className="form-section">
            <span className="form-number">03</span>
            <div><h2>Confirm your spot</h2><p>Your account is set up. Finish in Stripe’s secure checkout.</p></div>
          </div>
          <div className="onboarding-profile-review">
            <PlayerAvatar name={`${profile?.first_name ?? "Golfer"} ${profile?.last_name ?? ""}`} src={preview} size="medium" />
            <div><strong>{profile?.first_name} {profile?.last_name}</strong><span>Handicap ID · {profile?.handicap_id}</span></div>
          </div>
          <div className="checkout-summary">
            <div><span>Shooktoberfest entry</span><strong>${event.entry}</strong></div>
            <p>Golf · $75 prize pot · food · drinks · live band</p>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary form-submit" type="button" onClick={() => void openCheckout()} disabled={busy !== null}>
            {busy === "payment" ? "Opening Stripe…" : `Pay securely with Stripe · $${event.entry}`}
          </button>
          <div className="onboarding-payment-footer"><button className="text-link" type="button" onClick={() => { setError(""); setStep(2); }}>← Replace photo</button><p>Your spot is held for 30 minutes once checkout opens.</p></div>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { getBrowserClient } from "../../lib/supabase/client";

const demoPhotos = [
  { tone: "green", caption: "Principal’s Nose: still undefeated.", author: "Mike B." },
  { tone: "orange", caption: "Group 3 found the beverage cart.", author: "Sean D." },
  { tone: "lime", caption: "Closest so far on 7. Allegedly.", author: "Justin S." },
  { tone: "dark", caption: "The walk to 18 felt longer than advertised.", author: "Nate W." },
];

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare photo.")), "image/jpeg", .82));
}

export default function PhotoWall() {
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setMessage("Preparing photo…");
    const client = getBrowserClient();
    if (!client) { setMessage("Demo mode: photo uploads unlock when Supabase is connected."); return; }
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) { setMessage("Sign in before posting a photo."); return; }
    const { data: player } = await client.from("players").select("id,event_id").eq("auth_user_id", auth.user.id).single();
    if (!player) { setMessage("Your player record could not be found."); return; }
    const image = await compressImage(file);
    const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from("event-photos").upload(path, image, { contentType: "image/jpeg" });
    if (error) { setMessage(error.message); return; }
    const { error: rowError } = await client.from("photos").insert({ event_id: player.event_id, player_id: player.id, storage_path: path });
    setMessage(rowError ? rowError.message : "Photo posted. Nice evidence.");
  }

  return (
    <>
      <label className="photo-upload"><input type="file" accept="image/*" capture="environment" onChange={event => void upload(event.target.files?.[0])} /><span className="button button-primary">Add a photo</span><small>{message || "JPEG, resized before upload"}</small></label>
      <div className="photo-wall">{demoPhotos.map((photo, index) => <article key={photo.caption} className={`photo-placeholder ${photo.tone}`}><div className="photo-number">0{index + 1}</div><div><p>{photo.caption}</p><span>{photo.author} · ♡ {index * 3 + 2}</span></div></article>)}</div>
    </>
  );
}

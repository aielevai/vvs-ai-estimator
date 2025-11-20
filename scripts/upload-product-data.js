import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function getArg(flag) {
  const index = process.argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) return null;
  const value = process.argv[index];
  if (value.includes("=")) {
    return value.split("=")[1];
  }
  return process.argv[index + 1] || null;
}

function deriveRemoteName(localPath, fallbackPrefix, explicitName) {
  if (explicitName) {
    return explicitName;
  }
  const ext = path.extname(localPath) || (fallbackPrefix === "ahlsell" ? ".csv" : ".txt");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${fallbackPrefix}-${timestamp}${ext}`;
}

async function uploadFile(client, localPath, remoteName, contentType) {
  if (!localPath) return null;
  if (!fs.existsSync(localPath)) {
    console.warn(`⚠️  Skipping upload, file not found: ${localPath}`);
    return null;
  }

  const buffer = fs.readFileSync(localPath);
  console.log(`⬆️  Uploading ${localPath} → ${remoteName}`);

  const { data, error } = await client.storage
    .from("product-data")
    .upload(remoteName, buffer, {
      cacheControl: "3600",
      upsert: true,
      contentType,
    });

  if (error) {
    throw error;
  }

  return data;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.");
    process.exit(1);
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const csvPath = getArg("--csv") || path.resolve(process.cwd(), "data/ahlsell-latest.csv");
  const discountPath = getArg("--discount") || path.resolve(process.cwd(), "data/discount.txt");

  const csvRemoteName = deriveRemoteName(csvPath, "ahlsell", getArg("--csv-name"));
  const discountRemoteName = deriveRemoteName(discountPath, "discount", getArg("--discount-name"));

  try {
    let uploaded = 0;

    if (csvPath) {
      await uploadFile(client, csvPath, csvRemoteName, "text/csv");
      uploaded++;
      if (getArg("--alias-latest")) {
        await uploadFile(client, csvPath, "ahlsell-latest.csv", "text/csv");
      }
    }

    if (discountPath) {
      await uploadFile(client, discountPath, discountRemoteName, "text/plain");
      uploaded++;
      if (getArg("--alias-latest")) {
        await uploadFile(client, discountPath, "discount.txt", "text/plain");
      }
    }

    if (uploaded === 0) {
      console.warn("⚠️  Nothing was uploaded. Provide --csv and/or --discount paths.");
    } else {
      console.log("✅ Upload complete.");
    }
  } catch (error) {
    console.error("❌ Upload failed:", error.message || error);
    process.exit(1);
  }
}

main();


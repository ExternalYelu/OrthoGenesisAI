"use client";

import { useMemo, useState } from "react";
import { exportBundle, exportModel, getJob } from "@/lib/api";
import { Button } from "./Button";

const formats = [
  { name: "STL", desc: "3D printing (slicer ready)" },
  { name: "OBJ", desc: "CAD and simulation pipelines" },
  { name: "GLTF", desc: "Web sharing and browser review" }
] as const;

const presets = [
  { key: "print", label: "Print", desc: "Higher fidelity with conservative smoothing" },
  { key: "clinical", label: "Clinical", desc: "Balanced quality for review workflows" },
  { key: "web", label: "Web", desc: "Optimized mesh size for fast web rendering" },
  { key: "draft", label: "Draft", desc: "Fastest turnaround for iteration" }
] as const;

export function ExportPanel() {
  const [modelId, setModelId] = useState("1");
  const [status, setStatus] = useState("");
  const [preset, setPreset] = useState<(typeof presets)[number]["key"]>("print");
  const [units, setUnits] = useState<"mm" | "cm" | "in">("mm");
  const [tolerance, setTolerance] = useState(0.25);
  const [selectedFormats, setSelectedFormats] = useState<Array<"stl" | "obj" | "gltf">>([
    "stl",
    "obj",
    "gltf"
  ]);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);

  const canBundle = selectedFormats.length > 0;

  const activePreset = useMemo(
    () => presets.find((entry) => entry.key === preset) || presets[0],
    [preset]
  );

  const toggleFormat = (format: "stl" | "obj" | "gltf") => {
    setSelectedFormats((prev) =>
      prev.includes(format) ? prev.filter((item) => item !== format) : [...prev, format]
    );
  };

  const handleExport = async (format: string) => {
    try {
      setStatus(`Exporting ${format}...`);
      const response = await exportModel(Number(modelId), format.toLowerCase(), undefined, true, {
        preset,
        units,
        tolerance_mm: tolerance
      });
      const jobMatch =
        typeof response.download_url === "string"
          ? response.download_url.match(/\/jobs\/([a-f0-9]+)/i)
          : null;
      if (!jobMatch) {
        window.open(response.download_url, "_blank");
        setStatus("Export ready. Download opened.");
        return;
      }

      const jobId = jobMatch[1];
      const timeoutAt = Date.now() + 120000;
      while (Date.now() < timeoutAt) {
        const job = await getJob(jobId);
        if (job.status === "dead" || job.status === "failed") {
          throw new Error(job.error || "Export job failed.");
        }
        if (job.status === "succeeded") {
          const url = job.result_json?.download_url;
          if (!url || typeof url !== "string") {
            throw new Error("Export completed but download URL was missing.");
          }
          const resolved = url.startsWith("/")
            ? `${process.env.NEXT_PUBLIC_API_URL || "/api"}${url}`
            : url;
          window.open(resolved, "_blank");
          setStatus("Export ready. Download opened.");
          return;
        }
        setStatus(`${job.stage} (${job.progress}%)`);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      throw new Error("Export timed out. Please retry.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed. Check model ID.");
    }
  };

  const handleBundle = async () => {
    if (!canBundle) return;
    try {
      setStatus("Building export bundle...");
      const response = await exportBundle(Number(modelId), {
        formats: selectedFormats,
        preset,
        units,
        tolerance_mm: tolerance
      });
      setManifest(response.manifest);
      window.open(response.download_url, "_blank");
      setStatus("Bundle ready. ZIP download opened.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bundle export failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <label className="text-xs uppercase tracking-[0.3em] text-slate/50" htmlFor="export-model-id">
            Model ID
          </label>
          <input
            id="export-model-id"
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Preset</p>
          <select
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={preset}
            onChange={(event) =>
              setPreset(event.target.value as (typeof presets)[number]["key"])
            }
          >
            {presets.map((entry) => (
              <option value={entry.key} key={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate">{activePreset.desc}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Units</p>
          <select
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={units}
            onChange={(event) => setUnits(event.target.value as "mm" | "cm" | "in")}
          >
            <option value="mm">Millimeters (mm)</option>
            <option value="cm">Centimeters (cm)</option>
            <option value="in">Inches (in)</option>
          </select>
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">
            Tolerance ({tolerance.toFixed(2)} mm)
          </p>
          <input
            className="mt-2 w-full accent-[#1f6feb]"
            type="range"
            min={0.05}
            max={1.5}
            step={0.05}
            value={tolerance}
            onChange={(event) => setTolerance(Number(event.target.value))}
          />
          <p className="mt-2 text-xs text-slate">
            Lower tolerance preserves detail. Higher tolerance smooths print surfaces.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {formats.map((format) => {
          const lower = format.name.toLowerCase() as "stl" | "obj" | "gltf";
          const selected = selectedFormats.includes(lower);
          return (
            <div
              key={format.name}
              className={`rounded-2xl border p-4 ${selected ? "border-[#1f6feb]/40 bg-[#eef4ff]" : "border-slate/10 bg-white/80"}`}
            >
              <p className="text-lg font-semibold text-ink">{format.name}</p>
              <p className="mt-1 text-xs text-slate">{format.desc}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="text-xs text-slate">
                  <input
                    className="mr-2 align-middle"
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleFormat(lower)}
                  />
                  Include in ZIP
                </label>
                <Button
                  className="px-4 py-2 text-xs"
                  label={`Export ${format.name}`}
                  onClick={() => handleExport(format.name)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">ZIP Bundle</p>
            <p className="text-xs text-slate">
              Creates one package with selected formats plus a `manifest.json` for traceability.
            </p>
          </div>
          <Button
            label="Download Bundle"
            onClick={handleBundle}
            variant={canBundle ? "primary" : "outline"}
            className={!canBundle ? "pointer-events-none opacity-60" : undefined}
          />
        </div>
      </div>

      {manifest ? (
        <div className="rounded-2xl border border-slate/10 bg-slate-50 p-4 text-xs text-slate">
          <p className="font-semibold text-ink">Last Bundle Manifest</p>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-3 text-[11px]">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </div>
      ) : null}

      {status ? <p className="text-xs text-slate">{status}</p> : null}
    </div>
  );
}

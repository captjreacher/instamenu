"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";

interface MenuUploadProps {
  onFileSelect: (file: File | null) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function MenuUpload({ onFileSelect }: MenuUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload an image file (JPEG, PNG, WebP, or HEIC).";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "File is too large. Maximum size is 10 MB.";
    }
    return null;
  }

  function processFile(file: File) {
    const error = validate(file);
    if (error) {
      setValidationError(error);
      setPreview(null);
      setFileName(null);
      onFileSelect(null);
      return;
    }

    setValidationError(null);
    setFileName(file.name);
    onFileSelect(file);

    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleClear() {
    setPreview(null);
    setFileName(null);
    setValidationError(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">
        Menu photo <span className="text-red-400">*</span>
      </label>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !preview && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !preview) {
            inputRef.current?.click();
          }
        }}
        aria-label="Upload menu photo"
        className={[
          "relative w-full rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden",
          "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-gray-950",
          isDragging
            ? "border-brand-400 bg-brand-500/10"
            : preview
            ? "border-brand-500/40 bg-gray-900 cursor-default"
            : "border-gray-700 bg-gray-900 hover:border-brand-500/60 hover:bg-gray-800/80 cursor-pointer",
        ].join(" ")}
      >
        {preview ? (
          /* Preview state */
          <div className="relative">
            <div className="relative w-full h-64">
              <Image
                src={preview}
                alt="Menu preview"
                fill
                className="object-cover"
                unoptimized
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />
            </div>
            {/* File name + actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <CheckIcon className="w-5 h-5 text-brand-400 shrink-0" />
                <span className="text-sm text-gray-200 truncate">{fileName}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="text-xs bg-gray-800 hover:bg-red-900/60 text-gray-300 hover:text-red-300 px-3 py-1.5 rounded-lg transition"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center select-none">
            <div
              className={[
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-200",
                isDragging
                  ? "bg-brand-500/20"
                  : "bg-gray-800",
              ].join(" ")}
            >
              <CameraIcon
                className={[
                  "w-8 h-8 transition-colors duration-200",
                  isDragging ? "text-brand-400" : "text-gray-400",
                ].join(" ")}
              />
            </div>
            <div>
              <p
                className={[
                  "text-base font-semibold transition-colors duration-200",
                  isDragging ? "text-brand-400" : "text-gray-200",
                ].join(" ")}
              >
                {isDragging ? "Drop it here" : "Drop your menu photo here"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or{" "}
                <span className="text-brand-400 underline underline-offset-2 decoration-brand-400/50">
                  click to browse
                </span>
              </p>
            </div>
            <p className="text-xs text-gray-600">
              JPEG, PNG, WebP, HEIC · Max 10 MB
            </p>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Validation error */}
      {validationError && (
        <p className="text-sm text-red-400 flex items-center gap-1.5">
          <ExclamationIcon className="w-4 h-4 shrink-0" />
          {validationError}
        </p>
      )}
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

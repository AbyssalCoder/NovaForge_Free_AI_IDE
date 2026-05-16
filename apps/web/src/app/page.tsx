"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/error-boundary";

const IDE = dynamic(() => import("@/components/IDE"), { ssr: false });

export default function Home() {
  return <ErrorBoundary><IDE /></ErrorBoundary>;
}

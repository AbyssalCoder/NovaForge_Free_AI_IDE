import { ErrorBoundary } from "@/components/error-boundary";
import IDE from "@/components/IDE";

export default function Home() {
  return <ErrorBoundary><IDE /></ErrorBoundary>;
}

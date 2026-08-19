import { HomePage } from "@/components/marketing/HomePage";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/home");

export default function Page() {
  return <HomePage />;
}

import { redirect } from "next/navigation";

export default function TestUploadPage() {
  redirect("/admin/products/new");
}

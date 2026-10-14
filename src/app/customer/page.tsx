import { redirect } from "next/navigation";
import { CUSTOMER_HOME } from "@/lib/routes";

export default function CustomerIndex() {
  redirect(CUSTOMER_HOME);
}

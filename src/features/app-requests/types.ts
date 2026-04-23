import type { CreateAppInput } from "@/features/create-app/validation";

export type CreateAppRequestInput = CreateAppInput & {
  templateSlug: string;
};

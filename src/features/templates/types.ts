export type TemplateField =
  | {
      name: "appName";
      label: "App Name";
      type: "text";
      required: true;
    }
  | {
      name: "description";
      label: "Short Description";
      type: "textarea";
      required: true;
    }
  | {
      name: "hostingTarget";
      label: "Hosting Target";
      type: "select";
      required: true;
      options: string[];
    };

export type PortalTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  status: "ACTIVE" | "DISABLED";
  fields: TemplateField[];
};

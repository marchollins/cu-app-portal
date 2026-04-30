type VerifyOptions = {
  fetchImpl?: typeof fetch;
};

export async function verifyPublishedUrl(
  publishUrl: string,
  { fetchImpl = fetch }: VerifyOptions = {},
) {
  const response = await fetchImpl(publishUrl, {
    method: "GET",
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";

  if (
    response.status === 200 ||
    (response.status >= 300 &&
      response.status < 400 &&
      location.includes("login.microsoftonline.com"))
  ) {
    return { verifiedAt: new Date() };
  }

  throw new Error(
    `Published URL ${publishUrl} did not return a healthy response. Status: ${response.status}.`,
  );
}

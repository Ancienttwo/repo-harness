function response(value: string, delayMs: number): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

export async function loadLatestDashboard(): Promise<string> {
  let visible = "";
  void response("older", 20).then((value) => { visible = value; });
  void response("newer", 1).then((value) => { visible = value; });
  await Bun.sleep(30);
  return visible;
}

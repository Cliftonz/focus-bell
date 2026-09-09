export const PICK_TIER_COMMAND = "focusBell.pickTier";

export type StatusItem = {
  text: string;
  tooltip: string;
  command: string;
  show(): void;
};

export function statusText(tier: string | undefined): string {
  const icon = tier === "tertiary" ? "$(bell-slash)" : "$(bell)";
  return `${icon} ${tier ?? "–"}`;
}

export function statusTooltip(tier: string | undefined, state: string | undefined): string {
  return `Focus Bell: ${tier ?? "untagged"}, ${state ?? "idle"}`;
}

export function createStatusBar(item: StatusItem): {
  update(tier: string | undefined, state: string | undefined): void;
} {
  item.command = PICK_TIER_COMMAND;
  item.show();
  return {
    update(tier, state) {
      item.text = statusText(tier);
      item.tooltip = statusTooltip(tier, state);
    },
  };
}

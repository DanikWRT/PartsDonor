# I1 fix C: complete the deal-status action coverage in the frontend

Repo: /home/aifactory/PartsDonor. Backend deal machine (backend/app/deal_machine.py) has a
valid path:
  created -> escrow_paid -> seller_confirmed -> shipped -> delivered -> buyer_confirmed
  -> payout -> completed

The frontend action sets only cover SOME of these, so the driver cannot advance a deal
along the full path in the UI. Two steps have NO action button anywhere:
  shipped -> delivered
  buyer_confirmed -> payout
Add them so the full 8-step machine is drivable from the UI.

The transition endpoint (POST /deals/{id}/transition, body {to, from_status}) allows
seller/buyer/admin AND any party of the deal can transition (backend `require_roles(
seller,buyer,admin)` + party-ownership check). So either role's token works.

## Changes (frontend/src/pages/Deal.jsx)
In the `SELLER_ACTIONS` object, currently:
  escrow_paid: [{ to: 'seller_confirmed', label: 'Подтвердить готовность', kind: 'neutral' }],
  seller_confirmed: [{ to: 'shipped', label: 'Отгрузить', kind: 'neutral' }],
  payout: [{ to: 'completed', label: 'Завершить сделку', kind: 'success' }],
Add two entries so the machine is fully covered:
  shipped: [{ to: 'delivered', label: 'Отметить доставленным', kind: 'neutral' }],
  buyer_confirmed: [{ to: 'payout', label: 'Выплатить продавцу', kind: 'neutral' }],
(In the real world shipped->delivered is the courier and buyer_confirmed->payout is the
platform release, but here a party of the deal triggers them for the demo, consistent
with how the rest of the machine works. Use kind:'neutral'.)

## Also (frontend/src/pages/BuyerCabinet.jsx)
Same two additions to its `BUYER_ACTIONS`/`SELLER_ACTIONS` if that page shows the stepper
and action buttons too. Check: BuyerCabinet.BUYER_ACTIONS currently has created->escrow_paid
and delivered->buyer_confirmed. Its deal rows advance via its own advanceDeal. If BuyerCabinet
also renders action buttons per deal, mirror the same shipped->delivered and
buyer_confirmed->payout additions. If BuyerCabinet does NOT render seller-side actions by status
outside created/delivered, leave it but still ensure the machine steps are reachable.
Keep it minimal: only add missing-step buttons; do not rearrange existing ones.

## Constraints
- Match existing style.
- Do not change backend.
- Do not change GET reads or auth.
- Preserve existing labels/kinds for existing actions.

## Verify
- cd frontend && npm run build must exit 0.
- Print diff summary.

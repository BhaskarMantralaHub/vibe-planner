#!/usr/bin/env bash
# Monthly Expense Report — sends a personalized monthly summary to each player.
# Invoked from .github/workflows/monthly-expense-report.yml.
# Reads env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
#                 RECIPIENT_INPUT (default "*" = all active players).

set -e

echo "=== Monthly Expense Report ==="

SB_HEADERS=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Accept: application/json")

# Fetch the active season (is_active = true, set by user in UI)
SEASON=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_seasons" \
  --data-urlencode "select=id,name,year,season_type,fee_amount" \
  --data-urlencode "is_active=eq.true" \
  --data-urlencode "limit=1")

# Fallback: most recent season if none is marked active
if [ "$(echo "$SEASON" | jq length)" -eq 0 ]; then
  echo "No active season found, falling back to most recent..."
  SEASON=$(curl -s "${SB_HEADERS[@]}" \
    -G "$SUPABASE_URL/rest/v1/cricket_seasons" \
    --data-urlencode "select=id,name,year,season_type,fee_amount" \
    --data-urlencode "order=year.desc,created_at.desc" \
    --data-urlencode "limit=1")
fi

echo "Season: $(echo "$SEASON" | jq '.[0] | {name, year}')"

SEASON_ID=$(echo "$SEASON" | jq -r '.[0].id // empty')
SEASON_NAME=$(echo "$SEASON" | jq -r '.[0].name // "Current Season"')
FEE_AMOUNT=$(echo "$SEASON" | jq -r '.[0].fee_amount // "60"')

if [ -z "$SEASON_ID" ]; then
  echo "No season found. Skipping."
  exit 0
fi
echo "Season: $SEASON_NAME ($SEASON_ID), Fee: $FEE_AMOUNT"

# Fetch players
PLAYERS=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_players" \
  --data-urlencode "select=id,name,email,is_active,is_guest,jersey_number,designation" \
  --data-urlencode "is_active=eq.true" \
  --data-urlencode "is_guest=eq.false")
echo "Players: $(echo "$PLAYERS" | jq length)"

# Fetch expenses
EXPENSES=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_expenses" \
  --data-urlencode "select=*" \
  --data-urlencode "season_id=eq.$SEASON_ID" \
  --data-urlencode "deleted_at=is.null" \
  --data-urlencode "order=expense_date.desc")
echo "Expenses: $(echo "$EXPENSES" | jq length)"

# Fetch fees
FEES=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_season_fees" \
  --data-urlencode "select=*" \
  --data-urlencode "season_id=eq.$SEASON_ID")
echo "Fees: $(echo "$FEES" | jq length)"

# Fetch sponsorships
SPONSORS=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_sponsorships" \
  --data-urlencode "select=*" \
  --data-urlencode "season_id=eq.$SEASON_ID" \
  --data-urlencode "deleted_at=is.null")
echo "Sponsors: $(echo "$SPONSORS" | jq length)"

# Fetch upcoming matches for current month
MONTH_START=$(date +%Y-%m-01)
MONTH_END=$(date -d "$(date +%Y-%m-01) +1 month -1 day" +%Y-%m-%d 2>/dev/null || date -v+1m -v1d -v-1d +%Y-%m-%d)
MATCHES=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_schedule_matches" \
  --data-urlencode "select=opponent,match_date,match_time,venue,is_home,umpire" \
  --data-urlencode "season_id=eq.$SEASON_ID" \
  --data-urlencode "deleted_at=is.null" \
  --data-urlencode "match_date=gte.$MONTH_START" \
  --data-urlencode "match_date=lte.$MONTH_END" \
  --data-urlencode "order=match_date.asc")
echo "Matches this month: $(echo "$MATCHES" | jq length)"

# Fetch splits + their shares for this month — used to render the per-player
# "Your splits" section. PostgREST's nested select pulls cricket_split_shares
# alongside each split row, so per-player pivoting happens in jq below.
SPLITS=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_splits" \
  --data-urlencode "select=id,paid_by,description,category,amount,split_date,cricket_split_shares(player_id,share_amount)" \
  --data-urlencode "season_id=eq.$SEASON_ID" \
  --data-urlencode "deleted_at=is.null" \
  --data-urlencode "split_date=gte.$MONTH_START" \
  --data-urlencode "split_date=lte.$MONTH_END" \
  --data-urlencode "order=split_date.desc")
echo "Splits this month: $(echo "$SPLITS" | jq length)"

# Fetch settlements from the start of the month forward — used to know whether
# a player's monthly split balance is already settled (so we can suppress the
# "Your splits" section for players who owe nothing and are owed nothing).
SETTLEMENTS=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_split_settlements" \
  --data-urlencode "select=from_player,to_player,amount,settled_date" \
  --data-urlencode "settled_date=gte.$MONTH_START")
echo "Settlements (month-onward): $(echo "$SETTLEMENTS" | jq length)"

# Build a map of player_id -> name for splits payer lookups (includes guests/inactive
# so we don't show "Unknown" for past contributors).
ALL_PLAYERS=$(curl -s "${SB_HEADERS[@]}" \
  -G "$SUPABASE_URL/rest/v1/cricket_players" \
  --data-urlencode "select=id,name")
PLAYER_NAME_MAP=$(echo "$ALL_PLAYERS" | jq -c 'map({(.id): .name}) | add // {}')

# Build report
REPORT=$(jq -n \
  --argjson players "$PLAYERS" \
  --argjson expenses "$EXPENSES" \
  --argjson fees "$FEES" \
  --argjson sponsors "$SPONSORS" \
  --arg season_name "$SEASON_NAME" \
  --arg fee_amount "$FEE_AMOUNT" '

  ($fee_amount | tonumber) as $feeAmt |
  ($fees | map(.amount_paid | tostring | tonumber) | add // 0) as $totalFees |
  ($sponsors | map(.amount | tostring | tonumber) | add // 0) as $totalSponsors |
  ($totalFees + $totalSponsors) as $totalCollected |
  ($expenses | map(.amount | tostring | tonumber) | add // 0) as $totalSpent |
  ($totalCollected - $totalSpent) as $poolBalance |

  # Category breakdown
  (if ($expenses | length) > 0 then
    $expenses | group_by(.category) | map({
      category: .[0].category,
      total: (map(.amount | tostring | tonumber) | add),
      count: length
    }) | sort_by(-.total)
  else [] end) as $categories |

  # Fee status
  ($fees | map({(.player_id): (.amount_paid | tostring | tonumber)}) | add // {}) as $feeMap |
  ($players | map(select(($feeMap[.id] // 0) >= $feeAmt))) as $paidPlayers |
  ($players | map(select(($feeMap[.id] // 0) < $feeAmt))) as $unpaidPlayers |

  # Recent expenses
  $expenses as $recent_all |

  {
    season_name: $season_name,
    fee_amount: $feeAmt,
    total_fees: $totalFees,
    total_sponsors: $totalSponsors,
    sponsors: ($sponsors | map({name: .sponsor_name, amount: (.amount | tostring | tonumber), date: (.sponsored_date | split("T")[0]), notes: (.notes // "")}) | sort_by(-.amount)),
    total_collected: $totalCollected,
    total_spent: $totalSpent,
    pool_balance: $poolBalance,
    player_count: ($players | length),
    paid_count: ($paidPlayers | length),
    unpaid_names: ($unpaidPlayers | map(.name)),
    categories: $categories,
    recent_all: $recent_all,
    expense_count: ($expenses | length),
    paid_players: ($paidPlayers | map({name: .name, jersey: .jersey_number, designation: .designation})),
    unpaid_players: ($unpaidPlayers | map({name: .name, jersey: .jersey_number}))
  }
')

echo "Report summary:"
echo "$REPORT" | jq '{total_collected, total_spent, pool_balance, player_count, paid_count, expense_count}'

# Extract values for HTML — format dollar amounts to 2 decimals (e.g. $2.71, $40.00)
TC=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.total_collected')")
TS=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.total_spent')")
PB=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.pool_balance')")
PC=$(echo "$REPORT" | jq -r '.player_count')
PAID=$(echo "$REPORT" | jq -r '.paid_count')
EC=$(echo "$REPORT" | jq -r '.expense_count')
FA=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.fee_amount')")
BAL_COLOR=$(echo "$REPORT" | jq -r 'if .pool_balance >= 0 then "#16a34a" else "#dc2626" end')
BAL_BG=$(echo "$REPORT" | jq -r 'if .pool_balance >= 0 then "#f0fdf4" else "#fef2f2" end')
BAL_SIGN=$(echo "$REPORT" | jq -r 'if .pool_balance < 0 then "-" else "" end')
BAL_ABS=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.pool_balance | fabs')")

MONTH_NAME=$(date +"%B %Y")
MONTH_SHORT=$(date +"%B")
MATCH_COUNT=$(echo "$MATCHES" | jq length)

# Match rows for this month
MATCH_ROWS=""
if [ "$MATCH_COUNT" -gt 0 ]; then
  MATCH_ROWS=$(echo "$MATCHES" | jq -r '.[] | (.match_date | split("T")[0]) as $d | (.match_time | split(":") | (.[0] | tonumber) as $h | (.[1]) as $m | (if $h >= 12 then "PM" else "AM" end) as $ap | "\($h % 12 | if . == 0 then 12 else . end):\($m) \($ap)") as $t | (if .is_home == true then "Home" elif .is_home == false then "Away" else "" end) as $ha | (if .is_home == true then "#16a34a" elif .is_home == false then "#2563eb" else "#888" end) as $hc | "<tr><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;white-space:nowrap;color:#888;font-size:12px\">\($d)<br>\($t)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;font-weight:600\">vs \(.opponent)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px\"><span style=\"color:\($hc);font-weight:700\">\($ha)</span></td></tr>"')
fi

# All expense rows — date, description + category, amount
# fmt2 — format a number as a 2-decimal string (2.71, 40.00, 0.05) without
# trailing-zero loss. jq has no native printf; this builds the string manually
# by multiplying by 100, rounding to int, then re-inserting the decimal point.
CAT_LABELS='{"ground":"Jerseys","equipment":"Cricket Kit","tournament":"Tournament","food":"Food & Drinks","other":"Other"}'
EXPENSE_ROWS=$(echo "$REPORT" | jq -r --argjson L "$CAT_LABELS" '
  def fmt2: . * 100 | round | tostring |
    if length == 1 then "0.0" + .
    elif length == 2 then "0." + .
    else .[:-2] + "." + .[-2:]
    end;
  .recent_all[] |
  ($L[.category] // .category) as $cat |
  (.expense_date | split("T")[0]) as $d |
  (.description // "") as $desc |
  (if $desc != "" and $desc != $cat then "\($desc) <span style=\"color:#aaa\">· \($cat)</span>" else $cat end) as $label |
  "<tr><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px;white-space:nowrap\">\($d)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0\">\($label)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700\">$\(.amount | tostring | tonumber | fmt2)</td></tr>"
' 2>/dev/null || echo "")

# Sponsor rows
SPONSOR_COUNT=$(echo "$REPORT" | jq '.sponsors | length')
TOTAL_SPONSORS=$(printf "%.2f" "$(echo "$REPORT" | jq -r '.total_sponsors')")
SPONSOR_ROWS=$(echo "$REPORT" | jq -r '
  def fmt2: . * 100 | round | tostring |
    if length == 1 then "0.0" + .
    elif length == 2 then "0." + .
    else .[:-2] + "." + .[-2:]
    end;
  .sponsors[] |
  (if .notes != "" then "\(.name) <span style=\"color:#aaa\">· \(.notes)</span>" else .name end) as $label |
  "<tr><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0\">\($label)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px\">\(.date)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#16a34a\">$\(.amount | fmt2)</td></tr>"
' 2>/dev/null || echo "")

# Fee table rows — sorted A-Z, paid first then unpaid
FEE_ROWS=$(echo "$REPORT" | jq -r '
  (.paid_players | sort_by(.name)[] | "<tr style=\"background:#f0fdf4\"><td style=\"padding:8px 14px;border-bottom:1px solid #eee\">\(.name)</td><td style=\"padding:8px 14px;border-bottom:1px solid #eee;text-align:right\"><span style=\"color:#16a34a;font-weight:700\">Paid</span></td></tr>"),
  (.unpaid_players | sort_by(.name)[] | "<tr><td style=\"padding:8px 14px;border-bottom:1px solid #eee\">\(.name)</td><td style=\"padding:8px 14px;border-bottom:1px solid #eee;text-align:right\"><span style=\"color:#dc2626;font-weight:700\">Unpaid</span></td></tr>")
' 2>/dev/null || echo "")

# Build HTML (matches ShareButton PDF structure)
HTML="<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto'>

<!-- Banner -->
<div style='background:linear-gradient(135deg,#14325a,#234e82);padding:24px 28px;border-radius:16px 16px 0 0'>
  <div style='font-size:11px;color:#c8bea0;text-transform:uppercase;letter-spacing:1px'>Monthly Report</div>
  <div style='font-size:22px;font-weight:800;color:#fff;margin-top:4px'>Sunrisers Manteca</div>
  <div style='font-size:13px;color:#e8e0c8;margin-top:2px'>$SEASON_NAME &mdash; $MONTH_NAME</div>
</div>

<div style='background:#fff;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef;padding:16px 28px 0'>
  <div style='font-size:15px;color:#1e1e2f'>Hey team! Here is your monthly summary for <b>$MONTH_NAME</b>.</div>
  <div style='height:1px;background:#e5e7eb;margin-top:16px'></div>
</div>

<div style='background:#fff;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef'>

<!-- Upcoming Matches This Month -->
$(if [ "$MATCH_COUNT" -gt 0 ]; then echo "
<div style='padding:20px 28px'>
  <div style='font-size:15px;font-weight:700;color:#1e1e2f'>Matches in $MONTH_SHORT ($MATCH_COUNT)</div>
  <table width='100%' cellpadding='0' cellspacing='0' border='0' style='font-size:13px;margin-top:10px'>
    $MATCH_ROWS
  </table>
  <div style='margin-top:8px'><a href='https://viberstoolkit.com/cricket/schedule/' style='color:#4DBBEB;text-decoration:none;font-size:12px;font-weight:600'>View Full Schedule &rarr;</a></div>
</div>
<div style='padding:0 28px'><div style='height:1px;background:#e5e7eb'></div></div>"; fi)

<!-- Pool Fund Summary -->
<div style='padding:24px 28px 16px'>
  <div style='font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px'>Pool Fund</div>
  <table width='100%' cellpadding='0' cellspacing='4' border='0'><tr>
    <td width='33%' align='center' style='padding:14px 6px;background:#eff6ff;border-radius:10px'>
      <div style='font-size:26px;font-weight:800;color:#2563eb'>\$$TC</div>
      <div style='font-size:10px;color:#6b7280;margin-top:3px'>COLLECTED</div>
    </td>
    <td width='33%' align='center' style='padding:14px 6px;background:#fef3c7;border-radius:10px'>
      <div style='font-size:26px;font-weight:800;color:#d97706'>\$$TS</div>
      <div style='font-size:10px;color:#6b7280;margin-top:3px'>SPENT</div>
    </td>
    <td width='33%' align='center' style='padding:14px 6px;background:$BAL_BG;border-radius:10px'>
      <div style='font-size:26px;font-weight:800;color:$BAL_COLOR'>$BAL_SIGN\$$BAL_ABS</div>
      <div style='font-size:10px;color:#6b7280;margin-top:3px'>BALANCE</div>
    </td>
  </tr></table>
</div>

<div style='padding:0 28px'><div style='height:1px;background:#e5e7eb'></div></div>

<!-- Expenses -->
<div style='padding:20px 28px'>
  <div style='font-size:15px;font-weight:700;color:#1e1e2f'>Expenses &mdash; \$$TS total ($EC transactions)</div>
  <table width='100%' cellpadding='0' cellspacing='0' border='0' style='font-size:13px;margin-top:10px'>
    <tr style='background:#f8f9fb'><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase'>Date</td><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase'>Description</td><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;text-align:right'>Amount</td></tr>
    $EXPENSE_ROWS
  </table>
</div>

<div style='padding:0 28px'><div style='height:1px;background:#e5e7eb'></div></div>

<!-- Sponsorships -->
$(if [ "$SPONSOR_COUNT" -gt 0 ]; then echo "
<div style='padding:20px 28px'>
  <div style='font-size:15px;font-weight:700;color:#1e1e2f'>Sponsorships &mdash; \$$TOTAL_SPONSORS total</div>
  <table width='100%' cellpadding='0' cellspacing='0' border='0' style='font-size:13px;margin-top:10px'>
    <tr style='background:#f8f9fb'><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase'>Sponsor</td><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase'>Date</td><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;text-align:right'>Amount</td></tr>
    $SPONSOR_ROWS
  </table>
</div>
<div style='padding:0 28px'><div style='height:1px;background:#e5e7eb'></div></div>"; fi)

<!-- Season Fees -->
<div style='padding:20px 28px'>
  <div style='font-size:15px;font-weight:700;color:#1e1e2f'>Season Fee — \$$FA / player</div>
  <div style='margin-top:4px;font-size:13px'><span style='color:#16a34a;font-weight:700'>$PAID paid</span> <span style='color:#9ca3af'>of $PC players</span></div>
  <table width='100%' cellpadding='0' cellspacing='0' border='0' style='font-size:13px;margin-top:10px'>
    <tr style='background:#f8f9fb'><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase'>Player</td><td style='padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;text-align:right'>Status</td></tr>
    $FEE_ROWS
  </table>
</div>

<!-- Per-player splits (substituted in send_email) -->
<!--SPLITS_FOR_PLAYER-->

</div>

<!-- Footer -->
<div style='background:#f8f9fb;border:1px solid #e0e4ef;border-top:none;border-radius:0 0 16px 16px;padding:16px 28px;text-align:center'>
  <a href='https://viberstoolkit.com/cricket/' style='color:#4DBBEB;text-decoration:none;font-size:13px;font-weight:600'>View Full Details</a>
  <div style='font-size:11px;color:#9ca3af;margin-top:6px'>Designed by Bhaskar Mantrala &mdash; viberstoolkit.com</div>
</div>
</div>"

# Send individualized emails (one per player with personalized greeting)
SUBJECT="Sunrisers Manteca Cricket Team — $MONTH_NAME Monthly Report"
SENT_COUNT=0
FAIL_COUNT=0
FAILED_LIST=""

# HTML-safe name escaping
escape_html() { echo "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'; }

# Build the "Your splits" section HTML for a given player_id.
# Returns empty string when:
#   (a) player has no splits this month (no participation), OR
#   (b) player's net monthly balance is settled (|balance| < 1¢ after settlements)
# Splits stay private-per-recipient: each email shows only that player's data.
#
# Net balance math:
#   For each split where pid paid:        balance += (total - their_share)   [others owe pid]
#   For each split where pid is sharer:   balance -= their_share             [pid owes payer]
#   Settlement to pid (to_player == pid): balance -= amount                  [debt to pid paid down]
#   Settlement from pid (from_player==pid): balance += amount                [pid paid down their debt]
# |balance| ≈ 0 means settled.
build_splits_section() {
  local PID="$1"
  echo "$SPLITS" | jq -r \
    --arg pid "$PID" \
    --argjson nameMap "$PLAYER_NAME_MAP" \
    --argjson settlements "$SETTLEMENTS" '
    def fmt2: . * 100 | round | tostring |
      if length == 1 then "0.0" + .
      elif length == 2 then "0." + .
      else .[:-2] + "." + .[-2:]
      end;

    [.[] | select(.paid_by == $pid)] as $paid |
    [.[] | select(any(.cricket_split_shares[]?; .player_id == $pid))] as $shared |
    ($paid | length) as $paidCount |
    ($paid | map(.amount | tostring | tonumber) | add // 0) as $paidTotal |
    ($shared | length) as $sharedCount |
    ($shared | map(.cricket_split_shares[] | select(.player_id == $pid) | .share_amount | tostring | tonumber) | add // 0) as $sharedTotal |

    # Net balance from splits alone
    ($paid | map(
      .amount as $total |
      ([.cricket_split_shares[]? | select(.player_id == $pid) | .share_amount | tostring | tonumber] | add // 0) as $myShareIfAny |
      ($total | tostring | tonumber) - $myShareIfAny
    ) | add // 0) as $owedToMe |

    ($shared | map(
      if .paid_by == $pid then 0
      else ([.cricket_split_shares[]? | select(.player_id == $pid) | .share_amount | tostring | tonumber] | add // 0)
      end
    ) | add // 0) as $iOwe |

    # Apply settlements (this-month-onward) involving pid
    ($settlements | map(
      if .to_player == $pid then -((.amount | tostring | tonumber))
      elif .from_player == $pid then ((.amount | tostring | tonumber))
      else 0 end
    ) | add // 0) as $settlementDelta |

    ($owedToMe - $iOwe + $settlementDelta) as $netBalance |

    # Hide if (a) no participation OR (b) settled (|balance| < 1¢)
    if ($paidCount + $sharedCount) == 0 or (($netBalance | fabs) < 0.01) then "" else
      ([.[] | select(.paid_by == $pid or any(.cricket_split_shares[]?; .player_id == $pid))]
        | unique_by(.id) | sort_by(.split_date) | reverse | .[:5]
        | map(
            ($nameMap[.paid_by] // "Someone") as $payerName |
            (if .paid_by == $pid then "You paid" else "\($payerName) paid" end) as $paidByLabel |
            ([.cricket_split_shares[]? | select(.player_id == $pid) | .share_amount | tostring | tonumber] | add // 0) as $myShare |
            "<tr><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0\">\(.description // .category)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;color:#888;font-size:12px\">\($paidByLabel) · $\(.amount | tostring | tonumber | fmt2)</td><td style=\"padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700\">$\($myShare | fmt2)</td></tr>"
          ) | join("")
      ) as $rows |

      "<div style=\"padding:0 28px\"><div style=\"height:1px;background:#e5e7eb\"></div></div>" +
      "<div style=\"padding:20px 28px\">" +
      "<div style=\"font-size:15px;font-weight:700;color:#1e1e2f\">Your splits</div>" +
      "<div style=\"margin-top:2px;font-size:11px;color:#9ca3af\">Personal — only shown to you</div>" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"4\" border=\"0\" style=\"margin-top:10px\"><tr>" +
      "<td width=\"50%\" align=\"center\" style=\"padding:14px 6px;background:#f0fdf4;border-radius:10px\">" +
      "<div style=\"font-size:22px;font-weight:800;color:#16a34a\">$\($paidTotal | fmt2)</div>" +
      "<div style=\"font-size:10px;color:#6b7280;margin-top:3px\">YOU PAID · \($paidCount) split" + (if $paidCount == 1 then "" else "s" end) + "</div>" +
      "</td>" +
      "<td width=\"50%\" align=\"center\" style=\"padding:14px 6px;background:#fef3c7;border-radius:10px\">" +
      "<div style=\"font-size:22px;font-weight:800;color:#d97706\">$\($sharedTotal | fmt2)</div>" +
      "<div style=\"font-size:10px;color:#6b7280;margin-top:3px\">YOUR SHARE · \($sharedCount) split" + (if $sharedCount == 1 then "" else "s" end) + "</div>" +
      "</td>" +
      "</tr></table>" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"font-size:13px;margin-top:14px\">" +
      "<tr style=\"background:#f8f9fb\"><td style=\"padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase\">Description</td><td style=\"padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase\">Paid by · Total</td><td style=\"padding:8px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;text-align:right\">Your share</td></tr>" +
      $rows +
      "</table>" +
      "<div style=\"margin-top:8px\"><a href=\"https://viberstoolkit.com/cricket/splits\" style=\"color:#4DBBEB;text-decoration:none;font-size:12px;font-weight:600\">View all splits &rarr;</a></div>" +
      "</div>"
    end
  '
}

send_email() {
  local EMAIL="$1"
  local NAME="$2"
  local PID="$3"
  local FIRST=$(echo "$NAME" | awk '{print $1}')
  local SAFE_FIRST=$(escape_html "$FIRST")
  local SPLITS_SECTION=""
  if [ -n "$PID" ]; then
    SPLITS_SECTION=$(build_splits_section "$PID")
  fi
  # Bash parameter substitution (safe — no sed special char issues)
  local PERSONALIZED_HTML="${HTML//Hey team!/Hey $SAFE_FIRST!}"
  PERSONALIZED_HTML="${PERSONALIZED_HTML//<!--SPLITS_FOR_PLAYER-->/$SPLITS_SECTION}"

  local PAYLOAD=$(jq -n \
    --arg to "$EMAIL" \
    --arg subject "$SUBJECT" \
    --arg html "$PERSONALIZED_HTML" \
    '{from: "Sunrisers Manteca <noreply@viberstoolkit.com>", to: [$to], subject: $subject, html: $html}')

  # Send with retry on rate limit (up to 2 retries)
  local SUCCESS=false
  for ATTEMPT in 1 2 3; do
    RESPONSE=$(curl -s -X POST "https://api.resend.com/emails" \
      -H "Authorization: Bearer $RESEND_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD")

    if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
      echo "  ✅ $NAME → $EMAIL"
      SENT_COUNT=$((SENT_COUNT + 1))
      SUCCESS=true
      break
    fi

    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message // "Unknown error"')
    if echo "$ERROR_MSG" | grep -qi "rate\|too many"; then
      echo "  ⏳ Rate limited, retry $ATTEMPT/3 for $NAME..."
      sleep 2
    else
      break
    fi
  done

  if [ "$SUCCESS" = false ]; then
    echo "  ❌ $NAME → $EMAIL — $ERROR_MSG"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_LIST="${FAILED_LIST}  - $NAME ($EMAIL): $ERROR_MSG\n"
  fi
}

RECIPIENT_INPUT="${RECIPIENT_INPUT:-*}"
if [ -z "$RECIPIENT_INPUT" ]; then
  RECIPIENT_INPUT="*"
fi

# Build recipient list (avoid subshell so counters persist).
# Format: email|name|player_id  — player_id powers the per-player splits section.
RECIPIENT_LIST=""
if [ "$RECIPIENT_INPUT" = "*" ]; then
  echo "Sending to ALL active players..."
  RECIPIENT_LIST=$(echo "$PLAYERS" | jq -r '.[] | select(.email != null and .email != "") | "\(.email)|\(.name)|\(.id)"')
else
  echo "Sending to: $RECIPIENT_INPUT"
  IFS=',' read -ra INPUT_EMAILS <<< "$RECIPIENT_INPUT"
  for IEMAIL in "${INPUT_EMAILS[@]}"; do
    IEMAIL=$(echo "$IEMAIL" | xargs)
    IINFO=$(echo "$PLAYERS" | jq -r --arg e "$IEMAIL" '[.[] | select(.email != null and (.email | ascii_downcase) == ($e | ascii_downcase))] | .[0] // {} | "\(.name // "there")|\(.id // "")"')
    printf -v RECIPIENT_LIST '%s%s|%s\n' "$RECIPIENT_LIST" "$IEMAIL" "$IINFO"
  done
  RECIPIENT_LIST=$(echo -e "$RECIPIENT_LIST")
fi

if [ -z "$RECIPIENT_LIST" ]; then
  echo "⚠️ No recipients with email addresses found. Skipping send."
else
  # Send emails (no subshell — counters work correctly)
  while IFS='|' read -r PEMAIL PNAME PPID; do
    [ -z "$PEMAIL" ] && continue
    send_email "$PEMAIL" "$PNAME" "$PPID"
    sleep 0.3  # Rate limit: Resend allows 5 req/sec
  done <<< "$RECIPIENT_LIST"
fi

echo ""
echo "==============================="
echo "  DELIVERY SUMMARY"
echo "  ✅ Sent: $SENT_COUNT"
echo "  ❌ Failed: $FAIL_COUNT"
if [ -n "$FAILED_LIST" ]; then
  echo ""
  echo "  Failed recipients:"
  echo -e "$FAILED_LIST"
fi
echo "==============================="

echo "Done!"


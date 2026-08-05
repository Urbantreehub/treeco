/**
 * Urban Tree Services — Google Ads Monitor & Safe Auto-Actions
 * -----------------------------------------------------------------
 * Runs INSIDE your Google Ads account on a schedule (no servers, no API token).
 * Install: Google Ads → Tools → Bulk actions → Scripts → + → paste → Authorise → Preview → Schedule.
 * Account: Urban Tree Services (679-211-3323).
 *
 * WHAT IT DOES
 *  1. Emails you a digest: spend, conversions, cost/lead, per-campaign, budget-limited flags.
 *  2. SAFE AUTO-ACTION: adds obvious junk search terms (jobs/DIY/other cities/etc.) as
 *     exact negatives — but ONLY terms that match the hardcoded JUNK list, capped per run.
 *  3. REPORTS (does NOT auto-action): high-spend / zero-conversion search terms to review,
 *     disapproved ads, and anomalies. These wait for your decision.
 *
 * Nothing here raises a budget, changes a bid, or edits the website. It only adds
 * clearly-junk negatives (money-SAVING) and reports. Set AUTO_ADD_NEGATIVES=false to make it
 * report-only while you build trust.
 */

// ===================== CONFIG =====================
var CONFIG = {
  EMAIL: 'josh@urbantreeservices.net',
  LOOKBACK_DAYS: 7,                 // reporting window
  AUTO_ADD_NEGATIVES: true,         // false = report junk terms instead of adding them
  MAX_NEGATIVES_PER_RUN: 15,        // safety cap
  WASTE_REVIEW_MIN_COST: 8,         // NZ$: flag search terms costing >= this with 0 conversions (report only)
  ONLY_ENABLED_CAMPAIGNS: true,
  // Junk patterns — a term is auto-negated only if it CONTAINS one of these whole words.
  // Deliberately conservative: these are never customers. Add/remove as you learn.
  JUNK: [
    'job', 'jobs', 'career', 'careers', 'vacancy', 'hiring', 'apprentice', 'apprenticeship',
    'course', 'courses', 'training', 'qualification', 'nzqa', 'diploma',
    'diy', 'how to', 'yourself', 'rent', 'rental', 'hire a chainsaw', 'chainsaw hire',
    'for sale', 'firewood', 'mulch for sale', 'woodchip', 'wood chip',
    'salary', 'wage', 'free wood', 'free firewood',
    // other regions (you target Wellington only)
    'auckland', 'christchurch', 'hamilton', 'tauranga', 'dunedin', 'napier', 'palmerston',
    'nelson', 'rotorua', 'queenstown', 'invercargill', 'whangarei', 'gisborne', 'new plymouth'
  ]
};
// ==================================================

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var since = 'LAST_' + CONFIG.LOOKBACK_DAYS + '_DAYS';
  var lines = [];

  lines.push('<h2>Urban Tree Services — Google Ads digest</h2>');
  lines.push('<p style="color:#666">Last ' + CONFIG.LOOKBACK_DAYS + ' days · account 679-211-3323 · ' + tz + '</p>');

  // ---------- 1. Account + per-campaign performance ----------
  var totals = { cost: 0, conv: 0, clicks: 0, impr: 0 };
  var campRows = [];
  var campQuery =
    "SELECT campaign.name, campaign.status, campaign.advertising_channel_type, " +
    "metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions " +
    "FROM campaign WHERE segments.date DURING " + since +
    (CONFIG.ONLY_ENABLED_CAMPAIGNS ? " AND campaign.status = 'ENABLED'" : "") +
    " ORDER BY metrics.cost_micros DESC";
  var it = AdsApp.search(campQuery);
  while (it.hasNext()) {
    var r = it.next();
    var cost = (r.metrics.costMicros || 0) / 1e6;
    var conv = r.metrics.conversions || 0;
    var clicks = r.metrics.clicks || 0;
    totals.cost += cost; totals.conv += conv; totals.clicks += clicks;
    totals.impr += (r.metrics.impressions || 0);
    campRows.push({
      name: r.campaign.name, type: r.campaign.advertisingChannelType,
      cost: cost, conv: conv, clicks: clicks,
      cpl: conv > 0 ? cost / conv : null
    });
  }
  var cpl = totals.conv > 0 ? (totals.cost / totals.conv) : null;
  lines.push('<p><b>Spend:</b> NZ$' + totals.cost.toFixed(2) +
             ' &nbsp;|&nbsp; <b>Leads:</b> ' + totals.conv.toFixed(0) +
             ' &nbsp;|&nbsp; <b>Cost/lead:</b> ' + (cpl != null ? 'NZ$' + cpl.toFixed(0) : '—') +
             ' &nbsp;|&nbsp; <b>Clicks:</b> ' + totals.clicks + '</p>');
  lines.push(tableFromRows(
    ['Campaign', 'Type', 'Cost', 'Leads', 'Cost/lead'],
    campRows.map(function (c) {
      return [c.name, c.type, 'NZ$' + c.cost.toFixed(2), c.conv.toFixed(0),
              c.cpl != null ? 'NZ$' + c.cpl.toFixed(0) : '—'];
    })
  ));

  // ---------- 2. Budget-limited campaigns (report) ----------
  var budgetLimited = [];
  var bIt = AdsApp.search(
    "SELECT campaign.name FROM campaign " +
    "WHERE campaign.status = 'ENABLED' " +
    "AND campaign_budget.has_recommended_budget = TRUE AND segments.date DURING " + since);
  // (Not all accounts expose this cleanly; we also infer from the primary status below.)
  var plIt = AdsApp.search(
    "SELECT campaign.name, campaign.primary_status, campaign.primary_status_reasons " +
    "FROM campaign WHERE campaign.status = 'ENABLED'");
  while (plIt.hasNext()) {
    var pr = plIt.next();
    var reasons = (pr.campaign.primaryStatusReasons || []).join(', ');
    if (reasons.indexOf('BUDGET') > -1 || reasons.indexOf('LIMITED') > -1) {
      budgetLimited.push(pr.campaign.name + ' (' + reasons + ')');
    }
  }
  if (budgetLimited.length) {
    lines.push('<h3>⚠ Budget-limited (leaving leads on the table)</h3><ul><li>' +
               budgetLimited.join('</li><li>') + '</li></ul>');
  }

  // ---------- 3. Search terms: junk (auto) + waste (report) ----------
  var junkToAdd = [];   // {campaign, adGroup, term}
  var wasteReview = []; // {term, campaign, cost, clicks}
  var stQuery =
    "SELECT search_term_view.search_term, campaign.name, ad_group.name, " +
    "metrics.cost_micros, metrics.conversions, metrics.clicks " +
    "FROM search_term_view WHERE segments.date DURING " + since + " AND metrics.clicks > 0";
  var stIt = AdsApp.search(stQuery);
  while (stIt.hasNext()) {
    var s = stIt.next();
    var term = (s.searchTermView.searchTerm || '').toLowerCase();
    var cost = (s.metrics.costMicros || 0) / 1e6;
    var conv = s.metrics.conversions || 0;
    var clk = s.metrics.clicks || 0;
    if (isJunk(term)) {
      junkToAdd.push({ campaign: s.campaign.name, adGroup: s.adGroup.name, term: term });
    } else if (conv === 0 && cost >= CONFIG.WASTE_REVIEW_MIN_COST) {
      wasteReview.push({ term: term, campaign: s.campaign.name, cost: cost, clicks: clk });
    }
  }

  // 3a. SAFE AUTO-ACTION: add junk as exact negatives (capped)
  var added = [];
  if (CONFIG.AUTO_ADD_NEGATIVES && junkToAdd.length) {
    var seen = {};
    for (var i = 0; i < junkToAdd.length && added.length < CONFIG.MAX_NEGATIVES_PER_RUN; i++) {
      var j = junkToAdd[i];
      var key = j.campaign + '||' + j.term;
      if (seen[key]) continue; seen[key] = true;
      var camps = AdsApp.campaigns().withCondition("campaign.name = '" + esc(j.campaign) + "'").get();
      if (camps.hasNext()) {
        camps.next().createNegativeKeyword('[' + j.term + ']'); // exact negative
        added.push(j.term + '  →  ' + j.campaign);
      }
    }
  }
  if (added.length) {
    lines.push('<h3>✅ Auto-added ' + added.length + ' junk negatives</h3><ul><li>' +
               added.join('</li><li>') + '</li></ul>');
  } else if (junkToAdd.length && !CONFIG.AUTO_ADD_NEGATIVES) {
    lines.push('<h3>Junk terms to negate (auto-add is OFF)</h3><ul><li>' +
               junkToAdd.slice(0, 20).map(function (j) { return j.term; }).join('</li><li>') + '</li></ul>');
  }

  // 3b. REPORT: expensive, no-conversion terms to review yourself
  if (wasteReview.length) {
    wasteReview.sort(function (a, b) { return b.cost - a.cost; });
    lines.push('<h3>🔎 Review these — spend but no leads yet</h3>');
    lines.push(tableFromRows(
      ['Search term', 'Campaign', 'Cost', 'Clicks'],
      wasteReview.slice(0, 15).map(function (w) {
        return [w.term, w.campaign, 'NZ$' + w.cost.toFixed(2), String(w.clicks)];
      })
    ));
    lines.push('<p style="color:#666">Add any of these as negatives if they are not the work you want.</p>');
  }

  // ---------- 4. Disapproved ads (report) ----------
  var disapproved = [];
  var dIt = AdsApp.search(
    "SELECT campaign.name, ad_group.name, ad_group_ad.policy_summary.approval_status " +
    "FROM ad_group_ad WHERE ad_group_ad.policy_summary.approval_status = 'DISAPPROVED' " +
    "AND ad_group_ad.status != 'REMOVED'");
  while (dIt.hasNext()) {
    var d = dIt.next();
    disapproved.push(d.campaign.name + ' → ' + d.adGroup.name);
  }
  if (disapproved.length) {
    lines.push('<h3>⛔ Disapproved ads (fix or remove)</h3><ul><li>' +
               disapproved.slice(0, 20).join('</li><li>') + '</li></ul>');
  }

  // ---------- 5. Send ----------
  lines.push('<p style="color:#999;font-size:12px">Automated by your Google Ads Monitor script. ' +
             'Safe auto-actions: junk negatives only. Everything else is a recommendation.</p>');
  var html = lines.join('\n');
  MailApp.sendEmail({
    to: CONFIG.EMAIL,
    subject: 'Ads digest — NZ$' + totals.cost.toFixed(0) + ' spend, ' + totals.conv.toFixed(0) +
             ' leads' + (added.length ? ' · ' + added.length + ' negatives added' : ''),
    htmlBody: html
  });
  Logger.log('Digest sent to ' + CONFIG.EMAIL + '. Negatives added: ' + added.length);
}

// ---------- helpers ----------
function isJunk(term) {
  for (var i = 0; i < CONFIG.JUNK.length; i++) {
    var w = CONFIG.JUNK[i];
    // whole-word / phrase containment
    var re = new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)');
    if (re.test(term)) return true;
  }
  return false;
}
function esc(s) { return String(s).replace(/'/g, "\\'"); }
function tableFromRows(headers, rows) {
  var th = headers.map(function (h) {
    return '<th style="text-align:left;border-bottom:1px solid #ddd;padding:4px 10px 4px 0">' + h + '</th>';
  }).join('');
  var body = rows.map(function (r) {
    return '<tr>' + r.map(function (c) {
      return '<td style="padding:4px 10px 4px 0;border-bottom:1px solid #f0f0f0">' + c + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table style="border-collapse:collapse;font-size:14px;margin:6px 0"><tr>' + th + '</tr>' + body + '</table>';
}

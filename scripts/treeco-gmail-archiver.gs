/**
 * TreeCo Gmail -> Drive Archiver
 * ------------------------------------------------------------------
 * Saves business/compliance attachments from Gmail straight into the
 * matching Work/TreeCo subfolders, so everything lives in one place.
 *
 * SAFE: additive only. It never deletes or moves anything. Before saving
 * it checks the target folder for a file of the same name and SKIPS if
 * present, so re-running won't create duplicates. Every action is logged.
 *
 * HOW TO RUN:
 *   1. Select "archiveGmail" in the function dropdown, click Run.
 *   2. Authorize (this adds Gmail read access on top of Drive).
 *   3. Read the Execution log to see what was saved.
 */

var TREE = '1dDCOyYaUilxP4AamrHts0fpxLJ7UbWon';
var MAX_THREADS = 8; // per query

var G_LOG = [];
function glog(a, d) { var s = a + ' :: ' + d; G_LOG.push(s); Logger.log(s); }

// Resolve (find-or-create) a folder path under TreeCo, e.g. ['Staff','Employment Agreements']
function resolvePath(parts) {
  var f = DriveApp.getFolderById(TREE);
  for (var i = 0; i < parts.length; i++) {
    var it = f.getFoldersByName(parts[i]);
    f = it.hasNext() ? it.next() : f.createFolder(parts[i]);
  }
  return f;
}

// One archiving job. nameMatch (lowercase substring) is optional; null = any attachment.
function archiveJob(query, nameMatch, pathParts) {
  var target = resolvePath(pathParts);
  var dest = pathParts.join('/');
  var threads;
  try { threads = GmailApp.search(query, 0, MAX_THREADS); }
  catch (e) { glog('SKIP-QUERY', query + ' : ' + e.message); return; }
  if (!threads.length) { glog('NO-HITS', query + ' -> ' + dest); return; }

  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var atts = msgs[m].getAttachments({ includeInlineImages: false, includeAttachments: true });
      for (var a = 0; a < atts.length; a++) {
        var att = atts[a];
        var nm = att.getName();
        var low = nm.toLowerCase();
        // skip signature junk + non-docs
        if (/\.(png|gif|ics|vcf)$/i.test(nm) || att.getSize() < 8000) continue;
        if (nameMatch && low.indexOf(nameMatch.toLowerCase()) === -1) continue;
        if (target.getFilesByName(nm).hasNext()) { glog('EXISTS', nm + ' already in ' + dest); continue; }
        try {
          target.createFile(att.copyBlob()).setName(nm);
          glog('SAVED', '"' + nm + '" (' + Math.round(att.getSize()/1024) + 'kb) -> TreeCo/' + dest);
        } catch (e) { glog('ERR', nm + ' : ' + e.message); }
      }
    }
  }
}

function archiveGmail() {
  G_LOG = [];
  glog('START', 'Gmail -> TreeCo archiver');

  // Insurance broker docs (Meridian General)
  archiveJob('from:meridian subject:(Certificate of Insurance) has:attachment', null, ['Insurance']);
  archiveJob('from:meridian subject:(Liability Declaration) has:attachment', 'declaration', ['Insurance']);
  archiveJob('from:meridian subject:(Insurance Renewal) has:attachment', 'renewal', ['Insurance']);
  archiveJob('subject:("Certificate of Currency") has:attachment', 'currency', ['Insurance']);

  // Employment agreement (Resolve Legal, "Final")
  archiveJob('from:resolve subject:(Employment Agreement) has:attachment', 'final', ['Staff', 'Employment Agreements']);
  archiveJob('subject:("Letter of Engagement") has:attachment', 'engagement', ['Staff', 'Employment Agreements']);

  // Accountant / GST / financials (Laurenson CA)
  archiveJob('from:laurenson has:attachment', 'gst', ['Company & Admin', 'Financials']);
  archiveJob('subject:(GST) has:attachment', 'gst', ['Company & Admin', 'Financials']);

  // Vehicle / asset registration (chipper trailer 9CK67, NZTA)
  archiveJob('subject:(registration OR rego) has:attachment', null, ['Company & Admin', 'Vehicles & Assets']);

  // Staff qualifications (Primary ITO workplace assessor cert, MOJ)
  archiveJob('subject:("Workplace assessor") has:attachment', null, ['Staff', 'Qualifications & Checks']);

  // Client reports (QTRA arborist reports)
  archiveJob('subject:(QTRA) has:attachment', 'qtra', ['Client Compliance', 'Client Reports']);

  // write run log into TreeCo
  glog('DONE', G_LOG.length + ' log lines');
  var doc = DocumentApp.create('TreeCo Gmail Archiver - Run Log');
  doc.getBody().setText(G_LOG.join('\n'));
  DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(TREE));
  Logger.log('==== Gmail archiver done: ' + G_LOG.length + ' lines ====');
}

/**
 * TreeCo Drive Consolidation
 * ------------------------------------------------------------------
 * Makes Work/TreeCo the single home for all Urban Tree Services business
 * files. Pulls the real H&S system out of the legacy SAFETY folder and out
 * of "UTS - Company Master" into your app's LIVE TreeCo subfolders (the ones
 * your forms upload into by hardcoded ID), consolidates loose/scattered files,
 * and moves superseded / duplicate docs into an "Expired & Superseded" archive.
 *
 * SAFETY DESIGN:
 *   - Nothing is ever deleted. Duplicates + superseded docs are MOVED to
 *     TreeCo/Expired & Superseded (and /Duplicates) so you can review, then
 *     empty the Trash yourself later.
 *   - Moving a file/folder in Drive keeps its ID, so your app's uploads and
 *     StaffHub deep-links keep working.
 *   - Every step is wrapped in try/catch and logged; a bad ID skips, not aborts.
 *   - DRY_RUN = true first: it logs exactly what WOULD happen, moves nothing.
 *
 * HOW TO RUN:
 *   1. Run main() with DRY_RUN = true. Authorize when Google asks.
 *   2. Read the Execution log (View > Logs) - confirm it looks right.
 *   3. Set DRY_RUN = false, run main() again to perform the moves.
 *   4. A summary Doc "TreeCo Cleanup - Run Log" is created in TreeCo.
 */

var DRY_RUN = true;            // <-- flip to false for the real run
var RESHARE_HS = true;         // set link-view sharing on consolidated SWMS/SOP/Policy folders
var UHCC_VIEWER_EMAIL = '';    // optional: put Mark Raines' email here to add him as a viewer directly

// ---- TreeCo root + your app's LIVE upload subfolders (destinations, keep as-is) ----
var TREE        = '1dDCOyYaUilxP4AamrHts0fpxLJ7UbWon';
var T_SWMS      = '1t6zWZaOHul-RvzOTpKzJ8050o7pl1vpH';
var T_SOPS      = '1Jjs_RVgZwgP5Seses1rpMKBGal53Xi6M';
var T_POLICY    = '11ozaQ8ZLW_tbwp2WxhH3vswhAW-xJT2D';
var T_RA        = '1MBcY257fXNugfnNHevceXsUTIOSD3hbh';
var T_TOOLBOX   = '1p8AFTsELDsYkQDRPcD7wWHFFrxOnLKXm';
var T_PRESTART  = '1FG_gfzoCS-tqPZH1dM3qj-hbygEvphYX';
var T_PERMITS   = '1xPw8Y4o8vKp4dzdrZpg8IuwBug0m8JCv';
var T_INCIDENT  = '1rLnTq1XvC_Q_Yb1ITSijuCyvPi2f_PSW';
var T_AUDITS    = '1Nq5QEKBfpRvN9G4pRjE9ZqngCadwIPLC';
var T_SUBBIE    = '1UC9_8Cjv28w3gdPmUU1nH5DOzwmM5eWl';
var T_TRAINING  = '1aJejav6xyr6se0qbu09ELtmz1Vzzpn2x';
var T_EQUIP     = '1xdmb-H_OW5HCKp-5cAdNwE70sFaV1hRF';
var T_COMPLETED = '1wWhKLF36Mh_PwgRBK1n3Y4sdkNlKjSy9';

// ---- Sources ----
var S_SWMS       = '1Jnw6Sn3pWOfCACAATfkF1_jaabtgB_Sr'; // SAFETY/SWMS (shared w/ UHCC)
var S_SOPS       = '119GNHrYmtmSmXWhQtu358Ptn4sL1xknk'; // SAFETY/SOPs
var S_POLICIES   = '1Gq6nNefrqzZJ3b9xHJ_6LE_4A-lwBHrX'; // SAFETY/Policies
var S_REGISTERS  = '13l9ZqdWLQX0et4vVq_SXdTUJPli21OFJ'; // SAFETY/Registers
var S_SUPERSEDED = '1ROPgXPxrvuQk0t1YeI_MWxlAduy7-3ZO'; // SAFETY/Superseded
var S_STANDARDS  = '1OqIsOYmZkCVlCzK8aGGoigE2FO5T7eD2'; // SAFETY/Standards
var S_NEARMISS   = '1cefGF6cVmZzoVPSGK-2KsET4XWct0X-j'; // SAFETY/Near Miss reports

var CM_STAFF     = '1h1xQxZ_9RjnF0NEisdRIAJ_-jjFRgQ78'; // Company Master/Staff Records
var CM_CLIENT    = '1kw7Q83kggx-gPSEzFZodhye7Efvj3KoQ'; // Company Master/Client Compliance

var L_INSURANCE  = '1-CNQap4uuGkfTVAkENh1_2rG2x-2rwz7'; // legacy UTS/Insurance ect
var L_NEWEMP     = '1VQoR-ASKeFqawvYfwr2np0waNGqB3n0-'; // legacy NEW EMPLOYMENT AGREEMENTS
var L_TOOLBOXREC = '15BQjBvTSYJ0Ol1OWimiRsRm2UvmWHDAd'; // legacy Toolbox Meeting Records
var L_ADMIN      = '1Ve-wFz3qIY579rR9afw-CevgNqnyll0E'; // legacy Admin docs
var L_INCORP     = '1-5oinNvWyozC9RTTJLu7taGvFVoHCaYR'; // legacy Incorporated
var L_INCORPDUP  = '1RhiXCDfFWH_IIXBj7mn8vmjYvH06zDsX'; // legacy Incorporated Docs (duplicate set)
var L_TAX        = '1iZdDZF42S6nCTgPNGXqxaZYYOYTBJ_2j';
var L_IRD        = '1dvKsyL4kW7TJGnHVQB8Kc_7mv4ST9VcA';
var L_EMPFILES   = '18Hv-MnPsYMlY8dDtHKuwYWVwjxXDSxQj'; // legacy Employee Files
var L_SPENCERS   = '1Yr-7WbNYN7ql0k2hkZ6lSqs_f7pv1zin'; // legacy Spencers client pack
var L_JOSHQUAL   = '1daAP-pxydav-AutFr8Anr6RAHpoFn20F'; // legacy JOSH QUALIFICATIONS
var L_RISKASSESS = '129y22X3lbMcY34evfhb9EaHGlN50qjqV'; // legacy Risk Assessment (old html)

var WEBSITE_MEDIA = '145EqS_ZviZVUwmLZCitRke9qXTQsoWNw';
var SSSP          = '1TzoEBMSFyeOXxqqisVibtyvlADeTEtTo';

// ---- Individual files ----
var F_2026INS      = '1riApGFfu9jXd4ReOuPM2HGgLOqOBPnq_'; // 2026 Insurance.pdf (current)
var F_CERT2021     = '1t4NmnX4rAKZ9gNI5KuCDTfGY1V71qWgz'; // Cert of Currency 2021 (expired)
var F_JD           = '1StPcIV-i6tl-2CwU5B6Rz6v32RIWO2HhkWgzvnyRnic'; // JD_CrewLeader...

var F_EMP1 = '1hDshr5B6ecyVH8gycqjyBkPkMhCMJnotNpbXpxmJbX8'; // keep
var F_EMP2 = '1WHBY5S58WOmu8EytNmo4jf04CWnds_8TovuPIybR2YQ'; // dup
var F_EMP3 = '1OzTZSNJjVEHn9TZSro3q478yk9niC3OjtPnlfYdIoZ8'; // dup
var F_TRADECO_PLAN = '1aZeHWdjasjIlf8PpaiJoajG3lHDkdfdwvLLhUpkrY4c';

// Site RA + Toolbox Google Forms in Work root (keep one of each, expire the dup + 2020 originals)
var F_SITERA_KEEP  = '1A5EBKnR_eOpeIOKGVCmpKoQjYrc8ROfAFHlOtk55Jas';
var F_SITERA_DUP   = '1fatBeT6NylOHeE_wm5lKvrksnAVzWKYuXbmkJ74vvyY';
var F_TOOLBOX_KEEP = '13P3KSpGZx8llZ9aiN_36ihNDEUVIdQOAo3jE9wSP5sA';
var F_TOOLBOX_DUP  = '1K3A4tJArns_K_NvcqojtKUup1Sxg1ro9O-HVClqHQys';
var F_SSRA_2020    = '1nNd0pRBiZWRkU61Yn6_rxyS3utpqegsvD-tTuo7vgYY';
var F_ACCIDENT2020 = '1AzNQ_szZoFY4Aq2XHYQKGQlATvWWZAg6jR9gXgeFxg4';

// SSSP folder contents
var F_SSSP_RA_DOC  = '1fFgxVDAcgEqXhBi8S9pEPZrwobJbpBgpSAw4oUoBwb4';
var F_SSSP_RA_PDF  = '1s1Lo6XHzmQZYU-NDNdZDMSfr_XhH2-KO';
var F_SSSP_TB_PDF  = '159uxY3cXCgzgrOtkg7oPfaFNS3Mv2HR3';

// Superseded H&S individual files (-> Expired)
var EXP_HSMANUAL_DOC  = '1CfNZ7FJb9YTrLl7RgzOpeQM23-AIPybwVapzLE9XsRQ';
var EXP_HSMANUAL_DOCX = '15hcXrSknlHSQ6lHHOidDF7YbLuRXOfYK';
var EXP_STDOP_DOCX    = '16SK36FSx0-QiJIq5gtdXc_Yv0Xox4I4u';
var EXP_EMERGSOP_PDF  = '1XkuC35LyQihrtVjAa1CONOvES_TUi7U8';
var EXP_INCIDENT2020  = '1UT5TfEyxwxs7bVBrb89jA5Mv0s_RxnoT';
var EXP_HAZREG_V1     = '1BaY0jMh42xEG9jlziajOoABxds8UWmBv';
var EXP_COP2012_A     = '1sbyCuHhHKkWdEh0kFOHH_znFqAosDJXj'; // dup of the Standards copy

// Duplicates (-> Expired & Superseded/Duplicates)
var DUP_POL001    = '1fCVlP2WYY7Q8rA-CVpzIDNbd_Gmz_hdqI__uXXwblX0';
var DUP_REG004_A  = '1yaxZMiRksvgZbibV_G6RC1KNgKl55Wha';
var DUP_REG004_B  = '1Zy-EIpRF5WaaNaFGtuDY-XhPjqELZCHx';
var KEEP_REG004   = '183I8vlO0noKIAP8JKOJAtRViXLAxV8XL';
var DUP_SOPLEG_A  = '1Yo9SZjAk8-Wn-wlypDIFAmVB5yG5zYk0';
var DUP_SOPLEG_B  = '1P0HBdXN2_PJnGD31yysh9o2bvdeGv9nq';

// ---- logging ----
var LOG = [];
function log(action, detail) {
  var line = (DRY_RUN ? '[DRY] ' : '[RUN] ') + action + ' :: ' + detail;
  LOG.push(line);
  Logger.log(line);
}
function skip(detail) { log('SKIP', detail); }

// ---- helpers ----
function getFolder(id) { return DriveApp.getFolderById(id); }

function findOrCreateSub(parentId, name) {
  var parent = getFolder(parentId);
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  if (DRY_RUN) { log('CREATE-FOLDER', name + ' under ' + parent.getName()); return parent; }
  var f = parent.createFolder(name);
  log('CREATE-FOLDER', name + ' -> ' + f.getId());
  return f;
}

function moveFile(fileId, destFolder, label) {
  try {
    var f = DriveApp.getFileById(fileId);
    log('MOVE-FILE', '"' + f.getName() + '" -> ' + label);
    if (!DRY_RUN) f.moveTo(destFolder);
  } catch (e) { skip('file ' + fileId + ' (' + label + '): ' + e.message); }
}

function moveFolder(folderId, destFolder, label, renameTo) {
  try {
    var f = getFolder(folderId);
    var nm = f.getName();
    log('MOVE-FOLDER', '"' + nm + '"' + (renameTo ? ' rename->"' + renameTo + '"' : '') + ' -> ' + label);
    if (!DRY_RUN) { if (renameTo) f.setName(renameTo); f.moveTo(destFolder); }
  } catch (e) { skip('folder ' + folderId + ' (' + label + '): ' + e.message); }
}

/** Move all files (and optionally subfolders) OUT of srcId into destFolder. */
function moveContents(srcId, destFolder, label, includeSubfolders) {
  try {
    var src = getFolder(srcId);
    var files = src.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      log('MOVE-FILE', '"' + f.getName() + '" (from ' + src.getName() + ') -> ' + label);
      if (!DRY_RUN) f.moveTo(destFolder);
    }
    if (includeSubfolders) {
      var subs = src.getFolders();
      while (subs.hasNext()) {
        var sf = subs.next();
        log('MOVE-FOLDER', '"' + sf.getName() + '" (from ' + src.getName() + ') -> ' + label);
        if (!DRY_RUN) sf.moveTo(destFolder);
      }
    }
  } catch (e) { skip('contents of ' + srcId + ' (' + label + '): ' + e.message); }
}

function main() {
  LOG = [];
  log('START', 'TreeCo consolidation  DRY_RUN=' + DRY_RUN);
  var tree = getFolder(TREE);

  // ---- new TreeCo subfolders (idempotent) ----
  var fInsurance = findOrCreateSub(TREE, 'Insurance');
  var fInsExp    = findOrCreateSub(fInsurance.getId(), 'Expired');
  var fStaff     = findOrCreateSub(TREE, 'Staff');
  var fEmpAgr    = findOrCreateSub(fStaff.getId(), 'Employment Agreements');
  var fAdmin     = findOrCreateSub(TREE, 'Company & Admin');
  var fClient    = findOrCreateSub(TREE, 'Client Compliance');
  var fRegisters = findOrCreateSub(TREE, 'Registers');
  var fStandards = findOrCreateSub(TREE, 'Standards & Reference');
  var fMarketing = findOrCreateSub(TREE, 'Marketing');
  var fExpired   = findOrCreateSub(TREE, 'Expired & Superseded');
  var fDupes     = findOrCreateSub(fExpired.getId(), 'Duplicates');

  var swms = getFolder(T_SWMS), sops = getFolder(T_SOPS), policy = getFolder(T_POLICY);
  var ra = getFolder(T_RA), toolbox = getFolder(T_TOOLBOX), incident = getFolder(T_INCIDENT);
  var equip = getFolder(T_EQUIP), subbie = getFolder(T_SUBBIE);

  // ===== A. SWMS =====
  moveContents(S_SWMS, swms, 'TreeCo/SWMS', true);

  // ===== B. SOPs (legacy copies -> Duplicates first) =====
  moveFile(DUP_SOPLEG_A, fDupes, 'Expired/Duplicates');
  moveFile(DUP_SOPLEG_B, fDupes, 'Expired/Duplicates');
  moveContents(S_SOPS, sops, 'TreeCo/SOPs', true);

  // ===== C. Policies (POL-001 dup -> Duplicates) =====
  moveFile(DUP_POL001, fDupes, 'Expired/Duplicates');
  moveContents(S_POLICIES, policy, 'TreeCo/Health & Safety Policy', true);

  // ===== D. Registers =====
  moveFile(DUP_REG004_A, fDupes, 'Expired/Duplicates');
  moveFile(DUP_REG004_B, fDupes, 'Expired/Duplicates');
  moveFile(KEEP_REG004, equip, 'TreeCo/Equipment Register');
  moveContents(S_REGISTERS, fRegisters, 'TreeCo/Registers', true);

  // ===== E. Standards & Reference (drop the duplicate Code of Practice) =====
  moveFile(EXP_COP2012_A, fExpired, 'Expired & Superseded');
  moveContents(S_STANDARDS, fStandards, 'TreeCo/Standards & Reference', true);

  // ===== F. Near-miss / incident history =====
  moveFolder(S_NEARMISS, incident, 'TreeCo/Incident & Return-to-Work');

  // ===== G. Superseded H&S loose files -> Expired =====
  moveFolder(S_SUPERSEDED, fExpired, 'Expired & Superseded');
  moveFile(EXP_HSMANUAL_DOC,  fExpired, 'Expired & Superseded');
  moveFile(EXP_HSMANUAL_DOCX, fExpired, 'Expired & Superseded');
  moveFile(EXP_STDOP_DOCX,    fExpired, 'Expired & Superseded');
  moveFile(EXP_EMERGSOP_PDF,  fExpired, 'Expired & Superseded');
  moveFile(EXP_INCIDENT2020,  fExpired, 'Expired & Superseded');
  moveFile(EXP_HAZREG_V1,     fExpired, 'Expired & Superseded');

  // ===== H. Staff =====
  moveFolder(CM_STAFF,   fStaff, 'TreeCo/Staff');
  moveFolder(L_EMPFILES, fStaff, 'TreeCo/Staff');
  moveFolder(L_JOSHQUAL, fStaff, 'TreeCo/Staff');
  moveFolder(L_NEWEMP,   fEmpAgr, 'TreeCo/Staff/Employment Agreements');
  moveFile(F_JD,   fStaff,  'TreeCo/Staff');
  moveFile(F_EMP1, fEmpAgr, 'TreeCo/Staff/Employment Agreements'); // keep
  moveFile(F_EMP2, fDupes,  'Expired/Duplicates');
  moveFile(F_EMP3, fDupes,  'Expired/Duplicates');

  // ===== I. Client compliance =====
  moveContents(CM_CLIENT, fClient, 'TreeCo/Client Compliance', true);
  moveFolder(L_SPENCERS, fClient, 'TreeCo/Client Compliance');

  // ===== J. Company & Admin =====
  moveFolder(L_ADMIN,  fAdmin, 'TreeCo/Company & Admin');
  moveFolder(L_INCORP, fAdmin, 'TreeCo/Company & Admin');
  moveFolder(L_TAX,    fAdmin, 'TreeCo/Company & Admin');
  moveFolder(L_IRD,    fAdmin, 'TreeCo/Company & Admin');
  moveFolder(L_INCORPDUP, fDupes, 'Expired/Duplicates'); // duplicate incorporation set
  moveFile(F_TRADECO_PLAN, fAdmin, 'TreeCo/Company & Admin');

  // ===== K. Insurance =====
  moveContents(L_INSURANCE, fInsurance, 'TreeCo/Insurance', true); // brings its own Expired subfolder along as a subfolder
  moveFile(F_2026INS,  fInsurance, 'TreeCo/Insurance (current)');
  moveFile(F_CERT2021, fInsExp,    'TreeCo/Insurance/Expired');

  // ===== L. Risk assessments + toolbox (keep one form each) =====
  moveFile(F_SITERA_KEEP,  ra,      'TreeCo/Risk Assessments');
  moveFile(F_SITERA_DUP,   fDupes,  'Expired/Duplicates');
  moveFile(F_SSRA_2020,    fExpired,'Expired & Superseded');
  moveFile(F_ACCIDENT2020, fExpired,'Expired & Superseded');
  moveFile(F_TOOLBOX_KEEP, toolbox, 'TreeCo/Toolbox Meetings');
  moveFile(F_TOOLBOX_DUP,  fDupes,  'Expired/Duplicates');
  moveContents(L_RISKASSESS, ra, 'TreeCo/Risk Assessments', true);
  moveFile(F_SSSP_RA_DOC,  ra,      'TreeCo/Risk Assessments');
  moveFile(F_SSSP_RA_PDF,  ra,      'TreeCo/Risk Assessments');
  moveFile(F_SSSP_TB_PDF,  toolbox, 'TreeCo/Toolbox Meetings');
  moveFolder(L_TOOLBOXREC, toolbox, 'TreeCo/Toolbox Meetings');

  // ===== M. Marketing =====
  moveFolder(WEBSITE_MEDIA, fMarketing, 'TreeCo/Marketing');

  // ===== N. Re-share consolidated H&S folders (UHCC / Mark Raines) =====
  if (RESHARE_HS && !DRY_RUN) {
    [ [swms,'SWMS'], [sops,'SOPs'], [policy,'Health & Safety Policy'] ].forEach(function(p){
      try {
        p[0].setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        if (UHCC_VIEWER_EMAIL) p[0].addViewer(UHCC_VIEWER_EMAIL);
        log('SHARE', p[1] + ' view-link: ' + p[0].getUrl());
      } catch (e) { skip('share ' + p[1] + ': ' + e.message); }
    });
  } else if (RESHARE_HS) {
    log('SHARE', '(dry run) would set link-view on SWMS / SOPs / H&S Policy');
  }

  // ---- write run log to a Doc in TreeCo ----
  log('DONE', LOG.length + ' actions');
  if (!DRY_RUN) {
    var doc = DocumentApp.create('TreeCo Cleanup - Run Log');
    doc.getBody().setText(LOG.join('\n'));
    DriveApp.getFileById(doc.getId()).moveTo(tree);
    Logger.log('Run log: ' + doc.getUrl());
  }
  Logger.log('==== ' + LOG.length + ' actions (' + (DRY_RUN ? 'DRY RUN - nothing moved' : 'DONE') + ') ====');
}

import { GristDoc } from "app/client/components/GristDoc";
import { urlState } from "app/client/models/gristUrlState";
import { showExampleCard } from 'app/client/ui/ExampleCard';
import { examples } from 'app/client/ui/ExampleInfo';
import { createHelpTools, cssSectionHeader, cssSpacer, cssTools } from 'app/client/ui/LeftPanelCommon';
import { cssLinkText, cssPageEntry, cssPageIcon, cssPageLink } from 'app/client/ui/LeftPanelCommon';
import { hoverTooltip, tooltipCloseButton } from 'app/client/ui/tooltips';
import { colors } from 'app/client/ui2018/cssVars';
import { icon } from 'app/client/ui2018/icons';
import { cssLink } from 'app/client/ui2018/links';
import { menuAnnotate } from 'app/client/ui2018/menus';
import { userOverrideParams } from 'app/common/gristUrls';
import { Disposable, dom, makeTestId, Observable, observable, styled } from "grainjs";
import {getUserOrgPrefObs} from "app/client/models/UserPrefs";
import {loadGristDoc} from "app/client/lib/imports";

const testId = makeTestId('test-tools-');

export function tools(owner: Disposable, gristDoc: GristDoc, leftPanelOpen: Observable<boolean>): Element {
  const isOwner = gristDoc.docPageModel.currentDoc.get()?.access === 'owners';
  const isOverridden = Boolean(gristDoc.docPageModel.userOverride.get());
  const canViewAccessRules = observable(false);
  function updateCanViewAccessRules() {
    canViewAccessRules.set((isOwner && !isOverridden) ||
                           gristDoc.docModel.rules.getNumRows() > 0);
  }
  owner.autoDispose(gristDoc.docModel.rules.tableData.tableActionEmitter.addListener(updateCanViewAccessRules));
  updateCanViewAccessRules();
  return cssTools(
    cssTools.cls('-collapsed', (use) => !use(leftPanelOpen)),
    cssSectionHeader("TOOLS"),

    cssPageEntry(
      cssPageEntry.cls('-selected', (use) => use(gristDoc.activeViewId) === 'acl'),
      cssPageEntry.cls('-disabled', (use) => !use(canViewAccessRules)),
      dom.domComputed(canViewAccessRules, (_canViewAccessRules) => {
        return cssPageLink(
          cssPageIcon('EyeShow'),
          cssLinkText('Access Rules',
            menuAnnotate('Beta', cssBetaTag.cls(''))
          ),
          _canViewAccessRules ? urlState().setLinkUrl({docPage: 'acl'}) : null,
          isOverridden ? addRevertViewAsUI() : null,
        );
      }),
      testId('access-rules'),
    ),

    cssPageEntry(
      cssPageLink(cssPageIcon('Log'), cssLinkText('Document History'), testId('log'),
        dom.on('click', () => gristDoc.showTool('docHistory')))
    ),
    // TODO: polish validation and add it back
    dom.maybe((use) => use(gristDoc.app.features).validationsTool, () =>
      cssPageEntry(
        cssPageLink(cssPageIcon('Validation'), cssLinkText('Validate Data'), testId('validate'),
          dom.on('click', () => gristDoc.showTool('validations'))))
    ),
    cssPageEntry(
      cssPageEntry.cls('-selected', (use) => use(gristDoc.activeViewId) === 'code'),
      cssPageLink(cssPageIcon('Code'),
        cssLinkText('Code View'),
        urlState().setLinkUrl({docPage: 'code'})
      ),
      testId('code'),
    ),
    cssSpacer(),
    dom.maybe(gristDoc.docPageModel.currentDoc, (doc) => {
      const ex = examples.find(e => e.urlId === doc.urlId);
      if (!ex || !ex.tutorialUrl) { return null; }
      return cssPageEntry(
        cssPageLink(cssPageIcon('Page'), cssLinkText('How-to Tutorial'), testId('tutorial'),
          {href: ex.tutorialUrl, target: '_blank'},
          cssExampleCardOpener(
            icon('TypeDetails'),
            testId('welcome-opener'),
            automaticHelpTool(
              (info) => showExampleCard(ex, info),
              gristDoc,
              "seenExamples",
              ex.id
            ),
          ),
        ),
      );
    }),
    // Shows the 'Tour of this Document' button if a GristDocTour table exists
    // at the time of running. Currently doesn't observe the set of existing tables
    gristDoc.docData.getTable('GristDocTour') &&
    cssPageEntry(
      cssPageLink(
        cssPageIcon('Page'),
        cssLinkText('Tour of this Document'),
        testId('doctour'),
        automaticHelpTool(
          async ({markAsSeen}) => {
            const gristDocModule = await loadGristDoc();
            await gristDocModule.startDocTour(gristDoc.docData, markAsSeen);
          },
          gristDoc,
          "seenDocTours",
          gristDoc.docId()
        ),
      ),
    ),
    createHelpTools(gristDoc.docPageModel.appModel, false)
  );
}

/**
 * Helper for showing users some kind of help (example cards or document tours)
 * automatically if they haven't seen it before, or if they click
 * on some element to explicitly show it again. Put this in said dom element,
 * and it will provide the onclick handler and a handler which automatically
 * shows when the dom element is attached, both by calling showFunc.
 *
 * prefKey is a key for a list of identifiers saved in user preferences.
 * itemId should be a single identifier that fits in that list.
 * If itemId is already present then the help will not be shown automatically,
 * otherwise it will be added to the list and saved under prefKey
 * when info.markAsSeen() is called.
 */
function automaticHelpTool(
  showFunc: (info: AutomaticHelpToolInfo) => void,
  gristDoc: GristDoc,
  prefKey: 'seenExamples' | 'seenDocTours',
  itemId: number | string
) {
  function show(elem: HTMLElement, reopen: boolean) {
    const appModel = gristDoc.docPageModel.appModel;
    const prefObs: Observable<typeof itemId[] | undefined> = getUserOrgPrefObs(appModel, prefKey);
    const seenIds = prefObs.get() || [];

    // If this help was previously dismissed, don't show it again, unless the user is reopening it.
    if (!reopen && seenIds.includes(itemId)) {
      return;
    }

    // When the help is closed, if it's the first time it's dismissed, save this fact, to avoid
    // showing it automatically again in the future.
    function markAsSeen() {
      try {
        if (!seenIds.includes(itemId)) {
          const seen = new Set(seenIds);
          seen.add(itemId);
          prefObs.set([...seen].sort());
        }
      } catch (e) {
        // If we fail to save this preference, it's probably not worth alerting the user about,
        // so just log to console.
        // tslint:disable-next-line:no-console
        console.warn("Failed to save userPref " + prefKey, e);
      }
    }

    showFunc({elem, reopen, markAsSeen});
  }

  return [
    dom.on('click', (ev, elem) => {
      ev.preventDefault();
      show(elem as HTMLElement, true);
    }),
    (elem: HTMLElement) => {
      // Once the trigger element is attached to DOM, show the help
      setTimeout(() => show(elem, false), 0);
    }
  ];
}

/** Values which may be useful when showing an automatic help tool */
export interface AutomaticHelpToolInfo {
  // Element where automaticHelpTool is attached, typically a button,
  // which shows the help when clicked
  elem: HTMLElement;

  // true if the help was shown explicitly by clicking elem,
  // false if it's being shown automatically to new users
  reopen: boolean;

  // Call this when the user explicitly dismisses the help to
  // remember this in user preferences and not show it automatically on next load
  markAsSeen: () => void;
}

// When viewing a page as another user, the "Access Rules" page link includes a button to revert
// the user and open the page, and a click on the page link shows a tooltip to revert.
function addRevertViewAsUI() {
  return [
    // A button that allows reverting back to yourself.
    dom('a',
      cssExampleCardOpener.cls(''),
      cssRevertViewAsButton.cls(''),
      icon('Convert'),
      urlState().setHref(userOverrideParams(null, {docPage: 'acl'})),
      dom.on('click', (ev) => ev.stopPropagation()),    // Avoid refreshing the tooltip.
      testId('revert-view-as'),
    ),

    // A tooltip that allows reverting back to yourself.
    hoverTooltip((ctl) =>
      cssConvertTooltip(icon('Convert'),
        cssLink('Return to viewing as yourself',
          urlState().setHref(userOverrideParams(null, {docPage: 'acl'})),
        ),
        tooltipCloseButton(ctl),
      ),
      {openOnClick: true}
    ),
  ];
}

const cssConvertTooltip = styled('div', `
  display: flex;
  align-items: center;
  --icon-color: ${colors.lightGreen};

  & > .${cssLink.className} {
    margin-left: 8px;
  }
`);

const cssExampleCardOpener = styled('div', `
  cursor: pointer;
  margin-right: 4px;
  margin-left: auto;
  border-radius: 16px;
  border-radius: 3px;
  height: 24px;
  width: 24px;
  padding: 4px;
  line-height: 0px;
  --icon-color: ${colors.light};
  background-color: ${colors.lightGreen};
  &:hover {
    background-color: ${colors.darkGreen};
  }
  .${cssTools.className}-collapsed & {
    display: none;
  }
`);

const cssRevertViewAsButton = styled(cssExampleCardOpener, `
  background-color: ${colors.darkGrey};
  &:hover {
    background-color: ${colors.slate};
  }
`);

const cssBetaTag = styled('div', `
  .${cssPageEntry.className}-disabled & {
    opacity: 0.4;
  }
`);

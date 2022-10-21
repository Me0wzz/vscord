import { debug, DiagnosticSeverity, env, languages, Selection, TextDocument, window, workspace } from "vscode";
import { resolveLangName, toLower, toTitle, toUpper } from "./helpers/resolveLangName";
import { CONFIG_KEYS, EMPTY, FAKE_EMPTY } from "./constants";
import { type SetActivity } from "@xhayper/discord-rpc";
import { getFileSize } from "./helpers/getFileSize";
import { isExcluded } from "./helpers/isExcluded";
import { isObject } from "./helpers/isObject";
import { getConfig } from "./config";
import { dataClass } from "./data";
import { sep } from "node:path";

let totalProblems = 0;

export function onDiagnosticsChange() {
    const diagnostics = languages.getDiagnostics();

    let counted = 0;

    diagnostics.forEach((diagnostic) => {
        if (diagnostic[1]) {
            diagnostic[1].forEach((diagnostic) => {
                if (
                    diagnostic.severity === DiagnosticSeverity.Warning ||
                    diagnostic.severity === DiagnosticSeverity.Error
                )
                    counted++;
            });
        }
    });

    totalProblems = counted;
}

export const activity = async (
    previous: SetActivity = {},
    isViewing = false,
    isIdling = false
): Promise<SetActivity> => {
    const config = getConfig();

    const presence = previous;

    presence.startTimestamp = config.get(CONFIG_KEYS.Status.ShowElapsedTime)
        ? config.get(CONFIG_KEYS.Status.ResetElapsedTimePerFile)
            ? Date.now()
            : previous.startTimestamp ?? Date.now()
        : undefined;

    const detailsEnabled = config.get(CONFIG_KEYS.Status.Details.Enabled);
    const detailsIdleEnabled = config.get(CONFIG_KEYS.Status.Details.Idle.Enabled);
    const stateEnabled = config.get(CONFIG_KEYS.Status.State.Enabled);
    const stateIdleEnabled = config.get(CONFIG_KEYS.Status.State.Idle.Enabled);

    const gitRepo = dataClass.gitRemoteUrl?.toString("https").replace(/\.git$/, "");
    const gitOrg = dataClass.gitRemoteUrl?.organization ?? dataClass.gitRemoteUrl?.owner;
    const gitHost = dataClass.gitRemoteUrl?.source;

    const isRepositoryExcluded = !!gitRepo && isExcluded(config.get(CONFIG_KEYS.Ignore.Repositories), gitRepo);
    const isOrganizationExcluded = !!gitOrg && isExcluded(config.get(CONFIG_KEYS.Ignore.Organizations), gitOrg);
    const isGitHostExcluded = !!gitHost && isExcluded(config.get(CONFIG_KEYS.Ignore.GitHosts), gitHost);
    const isGitExcluded = isRepositoryExcluded || isOrganizationExcluded || isGitHostExcluded;

    const isWorkspaceExcluded =
        dataClass.workspaceFolder != null &&
        "uri" in dataClass.workspaceFolder &&
        isExcluded(config.get(CONFIG_KEYS.Ignore.Workspaces), dataClass.workspaceFolder.uri.fsPath);
    let workspaceExcludedText = "No workspace ignore text provided.";

    if (isWorkspaceExcluded) {
        const ignoreWorkspacesText = config.get(CONFIG_KEYS.Ignore.WorkspacesText);

        if (isObject(ignoreWorkspacesText)) {
            workspaceExcludedText =
                (dataClass.workspaceFolder ? ignoreWorkspacesText[dataClass.workspaceFolder.name] : undefined) ??
                workspaceExcludedText;
        } else {
            workspaceExcludedText = ignoreWorkspacesText ?? workspaceExcludedText;
        }
    }

    const isDebugging = !!debug.activeDebugSession;
    isViewing = !isDebugging && isViewing;

    const PROBLEMS = await replaceFileInfo(
        replaceGitInfo(replaceAppInfo(config.get(CONFIG_KEYS.Status.Problems.Text)), isGitExcluded),
        isWorkspaceExcluded,
        dataClass.editor?.document,
        dataClass.editor?.selection
    );

    const replaceAllText = async (text: string) =>
        (
            await replaceFileInfo(
                replaceGitInfo(replaceAppInfo(text), isGitExcluded),
                isWorkspaceExcluded,
                dataClass.editor?.document,
                dataClass.editor?.selection
            )
        ).replace("{problems}", PROBLEMS);

    const detailsText = detailsEnabled
        ? isIdling || !dataClass.editor
            ? detailsIdleEnabled
                ? await replaceAllText(config.get(CONFIG_KEYS.Status.Details.Text.Idle))
                : undefined
            : await replaceAllText(
                  isDebugging
                      ? config.get(CONFIG_KEYS.Status.Details.Text.Debugging)
                      : isViewing
                      ? config.get(CONFIG_KEYS.Status.Details.Text.Viewing)
                      : config.get(CONFIG_KEYS.Status.Details.Text.Editing)
              )
        : undefined;

    const stateText = stateEnabled
        ? isIdling || !dataClass.editor
            ? stateIdleEnabled
                ? await replaceAllText(config.get(CONFIG_KEYS.Status.State.Text.Idle))
                : undefined
            : await replaceAllText(
                  isDebugging
                      ? config.get(CONFIG_KEYS.Status.State.Text.Debugging)
                      : isViewing
                      ? config.get(CONFIG_KEYS.Status.State.Text.Viewing)
                      : config.get(CONFIG_KEYS.Status.State.Text.Editing)
              )
        : undefined;

    const largeImageKey = await replaceAllText(
        isIdling || !dataClass.editor
            ? config.get(CONFIG_KEYS.Status.Image.Large.Idle.Key)
            : isDebugging
            ? config.get(CONFIG_KEYS.Status.Image.Large.Debugging.Key)
            : isViewing
            ? config.get(CONFIG_KEYS.Status.Image.Large.Viewing.Key)
            : config.get(CONFIG_KEYS.Status.Image.Large.Editing.Key)
    );

    const largeImageText = await replaceAllText(
        isIdling || !dataClass.editor
            ? config.get(CONFIG_KEYS.Status.Image.Large.Idle.Text)
            : isDebugging
            ? config.get(CONFIG_KEYS.Status.Image.Large.Debugging.Text)
            : isViewing
            ? config.get(CONFIG_KEYS.Status.Image.Large.Viewing.Text)
            : config.get(CONFIG_KEYS.Status.Image.Large.Editing.Text)
    );

    const smallImageKey = await replaceAllText(
        isIdling || !dataClass.editor
            ? config.get(CONFIG_KEYS.Status.Image.Small.Idle.Key)
            : isDebugging
            ? config.get(CONFIG_KEYS.Status.Image.Small.Debugging.Key)
            : isViewing
            ? config.get(CONFIG_KEYS.Status.Image.Small.Viewing.Key)
            : config.get(CONFIG_KEYS.Status.Image.Small.Editing.Key)
    );

    const smallImageText = await replaceAllText(
        isIdling || !dataClass.editor
            ? config.get(CONFIG_KEYS.Status.Image.Small.Idle.Text)
            : isDebugging
            ? config.get(CONFIG_KEYS.Status.Image.Small.Debugging.Text)
            : isViewing
            ? config.get(CONFIG_KEYS.Status.Image.Small.Viewing.Text)
            : config.get(CONFIG_KEYS.Status.Image.Small.Editing.Text)
    );

    presence.details = detailsEnabled ? detailsText : undefined;
    presence.state = stateEnabled ? stateText : undefined;
    presence.largeImageKey = largeImageKey;
    presence.largeImageText = largeImageText;
    presence.smallImageKey = smallImageKey;
    presence.smallImageText = smallImageText;

    if (isIdling || !dataClass.editor) {
        if (config.get(CONFIG_KEYS.Status.Button.Idle.Enabled))
            presence.buttons = [
                {
                    label: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Idle.Label)),
                    url: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Idle.Url))
                }
            ];
    } else if (!isGitExcluded && dataClass.gitRemoteUrl) {
        if (config.get(CONFIG_KEYS.Status.Button.Active.Enabled))
            presence.buttons = [
                {
                    label: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Active.Label)),
                    url: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Active.Url))
                }
            ];
    } else if (isGitExcluded) {
        if (config.get(CONFIG_KEYS.Status.Button.Inactive.Enabled))
            presence.buttons = [
                {
                    label: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Inactive.Label)),
                    url: await replaceAllText(config.get(CONFIG_KEYS.Status.Button.Inactive.Url))
                }
            ];
    }

    return presence;
};

export const replaceAppInfo = (text: string): string => {
    text = text.slice();
    const { appName } = env;

    const isInsider = appName.includes("Insiders");
    const isCodium = appName.startsWith("VSCodium") || appName.startsWith("codium");

    const replaceMap = new Map([
        ["{app_name}", appName],
        [
            "{app_id}",
            isInsider ? (isCodium ? "vscodium-insiders" : "vscode-insiders") : isCodium ? "vscodium" : "vscode"
        ]
    ]);

    for (const [key, value] of replaceMap) text = text.replace(key, value);

    return text;
};

export const replaceGitInfo = (text: string, excluded: boolean = false): string => {
    text = text.slice();

    const replaceMap = new Map([
        [
            "{git_repo}",
            (!excluded ? (dataClass.gitRemoteUrl ? dataClass.gitRemoteUrl.name : dataClass.gitRepoName) : undefined) ??
                FAKE_EMPTY
        ],
        ["{git_branch}", (!excluded ? dataClass.gitBranchName : undefined) ?? FAKE_EMPTY],
        ["{git_url}", (!excluded ? dataClass.gitRemoteUrl?.toString("https") : undefined) ?? FAKE_EMPTY]
    ]);

    for (const [key, value] of replaceMap) text = text.replace(key, value);

    return text;
};

export const replaceFileInfo = async (
    text: string,
    excluded: boolean = false,
    document?: TextDocument,
    selection?: Selection
): Promise<string> => {
    const config = getConfig();
    text = text.slice();

    const workspaceFolderName = (!excluded ? dataClass.workspaceFolder?.name : undefined) ?? FAKE_EMPTY;
    const workspaceName =
        (!excluded ? dataClass.workspace?.replace("(Workspace)", EMPTY) : undefined) ?? workspaceFolderName;
    const workspaceAndFolder = !excluded
        ? `${workspaceName}${workspaceFolderName === FAKE_EMPTY ? "" : ` - ${workspaceFolderName}`}`
        : FAKE_EMPTY;

    let fullDirectoryName: string = FAKE_EMPTY;
    const fileIcon = dataClass.editor ? resolveLangName(dataClass.editor.document) : "text";
    const fileSize = await getFileSize(config, dataClass);

    if (dataClass.editor && dataClass.workspace && !excluded) {
        const name = dataClass.workspace;
        const relativePath = workspace.asRelativePath(dataClass.editor.document.fileName).split(sep);

        relativePath.splice(-1, 1);
        fullDirectoryName = `${name}${sep}${relativePath.join(sep)}`;
    }

    const replaceMap = new Map([
        ["{file_name}", dataClass.fileName ?? FAKE_EMPTY],
        ["{file_extenstion}", dataClass.fileExtension ?? FAKE_EMPTY],
        ["{file_size}", fileSize?.toString() ?? FAKE_EMPTY],
        ["{folder_and_file}", dataClass.folderAndFile ?? FAKE_EMPTY],
        ["{full_directory_name}", fullDirectoryName],
        ["{workspace}", workspaceName],
        ["{workspace_folder}", workspaceFolderName],
        ["{workspace_and_folder}", workspaceAndFolder],
        ["{lang}", toLower(fileIcon)],
        ["{Lang}", toTitle(fileIcon)],
        ["{LANG}", toUpper(fileIcon)],
        ["{problems_count}", config.get(CONFIG_KEYS.Status.Problems.Enabled) ? totalProblems.toString() : FAKE_EMPTY],
        ["{line_count}", document?.lineCount.toString() ?? FAKE_EMPTY],
        ["{current_line}", selection ? (selection.active.line + 1).toString() : FAKE_EMPTY],
        ["{current_column}", selection ? (selection.active.character + 1).toString() : FAKE_EMPTY]
    ]);

    for (const [key, value] of replaceMap) text = text.replace(key, value);

    return text;
};

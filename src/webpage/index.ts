import {AssemblError} from "./assembler/assembler.js";
import {Contextmenu} from "./contextMenu.js";
import {Editor} from "./editor/editor.js";
import {Console} from "./emulator/console.js";
import {Etab} from "./executeTab/etab.js";
import {I18n} from "./i18n.js";
import {Project} from "./projects/project.js";
import {ProjFiles} from "./projects/projectFiles.js";
const actionRow = document.getElementById("actionRow");
if (!actionRow) throw Error("action row not in document");
const cons = new Console();
//Waiting for the translations to load
await I18n.done;
const fileMenu = new Contextmenu("File");
fileMenu.addButton(
	() => I18n.file.new(),
	() => {
		newFile.click();
	},
);
fileMenu.addButton(
	() => I18n.file.open(),
	() => {
		openNewFile();
	},
);
fileMenu.addButton(
	() => I18n.file.save(),
	() => {
		focusedEditor.save();
	},
);
fileMenu.addButton(
	() => I18n.file.saveAll(),
	() => {
		editors.map((_) => _.save());
	},
);
fileMenu.addButton(
	() => I18n.file.saveAs(),
	() => {
		downloadEditor(focusedEditor);
	},
);

fileMenu.addButton(
	() => I18n.file.delete(),
	async () => {
		if (curProject) {
			const editor = focusedEditor;
			if (editor.fileDir) {
				if (!confirm(I18n.confirmDelete(editor.fileName))) {
					return;
				}

				const button = buttons.get(editor);
				if (button) button.remove();
				buttons.delete(editor);
				editors = editors.filter((_) => _ != editor);
				if (editor.fileDir) {
					Editor.editMap.delete(editor.fileDir);
				}
				focusedEditor = editors[0];
				await editArea();

				await curProject.delete(editor.fileDir);
				createRegiArea();
			}
		}
	},
	{
		visable: () => !!curProject,
	},
);

const fileButton = document.createElement("button");
fileButton.textContent = I18n.file.file();
actionRow.append(fileButton);
fileMenu.bindContextmenu(fileButton, undefined, undefined, true);

const menu = new Contextmenu("run");

const assemble = document.getElementById("assemble") as HTMLElement;
menu.addButton(
	() => I18n.run.assemble(),
	() => {
		assemble.click();
	},
	{
		enabled: () => !assemble.classList.contains("disabled"),
	},
);

const start = document.getElementById("start") as HTMLElement;
menu.addButton(
	() => I18n.run.run(),
	() => {
		start.click();
	},
	{
		enabled: () => !start.classList.contains("disabled"),
	},
);

const step = document.getElementById("step") as HTMLElement;
menu.addButton(
	() => I18n.run.step(),
	() => {
		step.click();
	},
	{
		enabled: () => !step.classList.contains("disabled"),
	},
);

const backStep = document.getElementById("backStep") as HTMLElement;
menu.addButton(
	() => I18n.run.backStep(),
	() => {
		backStep.click();
	},
	{
		enabled: () => !backStep.classList.contains("disabled"),
	},
);

const reset = document.getElementById("reset") as HTMLElement;
menu.addButton(
	() => I18n.run.reset(),
	() => {
		reset.click();
	},
	{
		enabled: () => !reset.classList.contains("disabled"),
	},
);

const runButton = document.createElement("button");
runButton.textContent = I18n.run.run();
actionRow.append(runButton);
menu.bindContextmenu(runButton, undefined, undefined, true);

const area = document.getElementById("area") as HTMLElement;
if (!area) throw Error("area not found");
let editors: Editor[] = [];

let focusedEditor = editors[0];

const newFile = document.getElementById("newFile") as HTMLImageElement;
newFile.onclick = async () => {
	system.disable();
	let i = 0;
	let name = `riscv${editors.length + 1}.asm`;
	if (curProject) {
		while (await curProject.checkName(curProject.name + ":/" + name)) {
			i++;
			name = `riscv${editors.length + 1 + i}.asm`;
		}
	}
	const editor = new Editor("", name, cons, curProject?.dir);
	if (curProject) {
		Editor.editMap.set(`${curProject.name}:/${editor.fileName}`, editor);
		editor.fileDir = `${curProject.name}:/${editor.fileName}`;
	}
	editors.push(editor);
	focusedEditor = editor;
	editArea();
	if (curProject) {
		setTimeout(() => editor.save(), 100);
	}
};

assemble.onclick = () => {
	focusedEditor.assemble();
};

const editButton = document.getElementById("EditButton") as HTMLButtonElement;
const executeButton = document.getElementById("ExecuteButton") as HTMLButtonElement;
editButton.onclick = () => {
	editArea();
};
executeButton.onclick = () => {
	executeArea();
};
let system = new Etab();

const buttons = new Map<Editor, HTMLButtonElement>();
const saved = new Map<Editor, boolean>();

function checkIfReload() {
	for (const [_, bool] of saved) {
		if (!bool) {
			window.onbeforeunload = () => "true";
			return;
		}
	}
	window.onbeforeunload = null;
}
let editAreadiv = document.createElement("div");
let selectedTab: HTMLElement;
async function createRegiArea() {
	const regiArea = document.getElementById("regiArea") as HTMLElement;
	if (projFile) {
		const html = await projFile.createHTML();
		regiArea.innerHTML = "";
		regiArea.append(html);
	} else {
		regiArea.innerHTML = "";
	}
}
async function editArea() {
	const tabs = document.createElement("div");
	tabs.classList.add("tabStyle");
	editButton.classList.add("selected");
	executeButton.classList.remove("selected");
	await createRegiArea();
	area.innerHTML = "";
	area.append(tabs);
	if (editors.length !== 0) {
		for (const editor of editors) {
			const bu = buttons.get(editor);
			if (bu) {
				if (editor === focusedEditor) {
					bu.click();
				}
				tabs.append(bu);
				continue;
			}
			const button = document.createElement("button");
			buttons.set(editor, button);
			button.textContent = editor.fileName;
			tabs.append(button);

			button.addEventListener("mousedown", (e) => {
				if (e.button === 1) {
					const saving = saved.get(editor);
					if (!saving) {
						if (!confirm(I18n.unsaved())) {
							return;
						}
					}
					button.remove();
					buttons.delete(editor);
					editors = editors.filter((_) => _ != editor);
					if (editor.fileDir) {
						Editor.editMap.delete(editor.fileDir);
					}
					if (editor == focusedEditor) {
						focusedEditor = editors[0];
						editArea();
					}
				}
			});

			button.addEventListener("click", () => {
				if (focusedEditor !== editor) {
					system.disable();
				}
				focusedEditor = editor;
				if (selectedTab) {
					selectedTab.classList.remove("selected");
				}
				editAreadiv.remove();
				editAreadiv = editor.createEditor();
				area.append(editAreadiv);
				button.classList.add("selected");
				selectedTab = button;
			});
			editor.addEventListener("Assemble", async (e) => {
				if (e.sys instanceof AssemblError) {
					console.error(e.sys);
					if (e.sys.file === (editor.fileDir || editor.fileName)) {
						button.click();
						try {
							editor.giveError(e.sys);
						} catch {
							console.error(e);
						}
					} else {
						if (!curProject) throw new Error("wow, something really broke, not sure what");
						let editor = Editor.editMap.get(e.sys.file);
						if (!editor) {
							const file = await curProject.getFile(e.sys.file);
							editor = new Editor(await file.text(), file.name, cons, curProject?.dir);
							Editor.editMap.set(e.sys.file, editor);
							editor.fileDir = e.sys.file;
							editors.push(editor);
						}
						focusedEditor = editor;
						try {
							editor.giveError(e.sys);
						} catch {
							console.error(e);
						}
						editArea();
					}
					cons.addMessage(e.sys.message, true);
				} else {
					system.handSystem(e.sys);
					executeArea();
				}
			});
			saved.set(editor, true);
			checkIfReload();
			editor.addEventListener("save", async () => {
				button.textContent = editor.fileName;
				saved.set(editor, true);
				checkIfReload();
				if (curProject) {
					await curProject.saveAsm(editor.fileName, editor.string());
					createRegiArea();
				} else {
					downloadEditor(editor);
				}
			});
			editor.addEventListener("changed", () => {
				button.textContent = editor.fileName + "*";
				saved.set(editor, false);
				checkIfReload();
				system.disable();
			});
			if (editor === focusedEditor) {
				button.click();
			}
		}
	} else {
		editAreadiv.remove();
		editAreadiv = document.createElement("div");
		area.append(editAreadiv);
		const h = document.createElement("h1");
		h.textContent = I18n.startScreen();

		const project = document.createElement("button");
		project.textContent = I18n.startProject();
		project.onclick = () => {
			newProjectDialog();
		};
		const file = document.createElement("button");
		file.textContent = I18n.openFile();
		file.onclick = () => {
			openNewFile();
		};

		editAreadiv.classList.add("flexttb", "start");

		const projectList = document.createElement("div");
		projectList.classList.add("flexttb", "projectList");

		const openExisting = document.createElement("h4");
		openExisting.textContent = I18n.project.openExisting();

		(async () => {
			for await (const thing of Project.getProjects()) {
				const button = document.createElement("button");
				button.textContent = thing.name;
				button.onclick = () => {
					openProject(thing);
				};
				projectList.append(button);
			}
		})();

		editAreadiv.append(h, project, file, openExisting, projectList);
		area.append(editAreadiv);
	}
}
const save = document.getElementById("save") as HTMLElement;
save.onclick = () => {
	if (focusedEditor) {
		focusedEditor.save();
	}
};
function newProjectDialog() {
	const dialog = document.createElement("dialog");
	document.body.append(dialog);
	const p1 = document.createElement("h4");
	p1.textContent = I18n.project.name();
	dialog.append(p1);

	const input = document.createElement("input");
	input.type = "text";
	dialog.append(input);

	const submit = document.createElement("button");
	submit.textContent = I18n.submit();
	dialog.append(submit);
	submit.onclick = async () => {
		const name = input.value;
		if (name.length === 0) {
			alert(I18n.project.pleaseEnterName());
			return;
		}
		const proj = await Project.checkName(name);
		if (proj) {
			dialog.remove();
			openProject(proj);
		} else {
			alert(I18n.project.nameTaken());
			return;
		}
	};

	dialog.showModal();
}
function openNewFile() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".asm";
	document.body.append(input);
	input.click();
	input.remove();
	input.onchange = async () => {
		if (input.files && input.files.length) {
			let newEditor: undefined | Editor;

			const editorList = Array.from(input.files).map(async (file) => {
				const editor = new Editor(await file.text(), file.name, cons, curProject?.dir);
				if (curProject) {
					Editor.editMap.set(`${curProject.name}:/${editor.fileName}`, editor);
					editor.fileDir = `${curProject.name}:/${editor.fileName}`;
				}
				newEditor ||= editor;
				editors.push(editor);
				return editor;
			});
			const arr = await Promise.all(editorList);
			if (newEditor) {
				focusedEditor = newEditor;
			}
			await editArea();

			if (curProject) {
				setTimeout(() => arr.forEach((e) => e.save()), 100);
			}
		}
	};
}
function downloadEditor(editor: Editor) {
	const text = editor.string();
	const fileName = editor.fileName;
	var blob = new Blob([text]);
	var a = document.createElement("a");
	a.download = fileName;
	a.href = URL.createObjectURL(blob);
	a.dataset.downloadurl = [a.download, a.href].join(":");
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(function () {
		URL.revokeObjectURL(a.href);
	}, 1500);
}
let curProject: Project | undefined;
let projFile: ProjFiles | undefined;
async function openProject(proj: Project) {
	curProject = proj;
	projFile = new ProjFiles(proj);
	projFile.addEventListener("open", async (e) => {
		const editor = Editor.editMap.get(`${proj.name}:${e.fileName}`);
		if (editor) {
			const button = buttons.get(editor);
			if (button) {
				button.click();
				return;
			}
		}
		const newEditor = new Editor(
			await e.file.text(),
			e.fileName.split("/").at(-1),
			cons,
			curProject?.dir,
		);
		editors.push(newEditor);
		focusedEditor = newEditor;
		Editor.editMap.set(`${proj.name}:/${newEditor.fileName}`, newEditor);
		newEditor.fileDir = `${proj.name}:/${newEditor.fileName}`;
		await editArea();
	});
	for await (const thing of proj.getAsm()) {
		const editor = new Editor(await thing[1].text(), thing[0], cons, curProject?.dir);
		Editor.editMap.set(`${curProject.name}:/${editor.fileName}`, editor);
		editor.fileDir = `${proj.name}:/${editor.fileName}`;
		if (!focusedEditor) {
			focusedEditor = editor;
		}
		editors.push(editor);
	}
	editArea();
}
const consoleElm = document.getElementById("console") as HTMLDivElement;
consoleElm.append(cons.makeHtml());
function executeArea() {
	area.innerHTML = "";

	editButton.classList.remove("selected");
	executeButton.classList.add("selected");
	cons.messageIClick();
	area.append(system.createHTML());
}
editArea();

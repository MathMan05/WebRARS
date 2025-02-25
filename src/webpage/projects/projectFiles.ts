import {I18n} from "../i18n.js";
import {Directory} from "../utils/utils.js";
import {Project} from "./project.js";
interface StateEventMap {
	open: FileEvent;
}

class FileEvent extends Event {
	fileName: string;
	file: File;
	constructor(event: string, fileName: string, file: File) {
		super(event);
		this.fileName = fileName;
		this.file = file;
	}
}
class ProjFiles extends EventTarget {
	pro: Project;
	constructor(pro: Project) {
		super();
		this.pro = pro;
	}
	async createHTML() {
		const div = document.createElement("div");
		div.classList.add("flexttb", "projFiles");

		const h2 = document.createElement("h3");
		h2.textContent = I18n.project.ProjFileHead(this.pro.name);
		div.append(h2);

		const files = await this.createDirHTML(this.pro.dir);
		div.append(files);
		return div;
	}
	addEventListener<K extends keyof StateEventMap>(
		type: K,
		listener: (ev: StateEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions,
	) {
		//@ts-expect-error
		super.addEventListener(type, listener, options);
	}
	async createDirHTML(
		dir: Directory,
		name: string | undefined = undefined,
		curDir = "/",
	): Promise<HTMLDivElement> {
		const div = document.createElement("div");
		div.classList.add("flexttb");
		if (name) {
			const h3 = document.createElement("h3");
			h3.textContent = name;
			div.append(h3);
			div.classList.add("indent");
		} else {
			div.classList.add("fileList");
		}
		for await (const [name, thing] of dir.getAllInDir()) {
			if (thing instanceof Directory) {
				div.append(await this.createDirHTML(thing, name, curDir + name + "/"));
			} else {
				const span = document.createElement("span");
				span.textContent = name;
				span.onclick = () => {
					this.dispatchEvent(new FileEvent("open", curDir + name, thing));
				};
				div.append(span);
			}
		}
		return div;
	}
}
export {ProjFiles};

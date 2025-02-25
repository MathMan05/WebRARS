import {Directory} from "../utils/utils.js";

class Project {
	name: string;
	dir: Directory;

	private constructor(name: string, dir: Directory) {
		this.name = name;
		this.dir = dir;
	}
	async createNewAsm(name: string) {
		await this.dir.setString(
			name,
			`.global main
.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`,
		);
		return [
			name,
			`.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`,
		];
	}
	async saveAsm(name: string, asm: string) {
		return await this.dir.setString(name, asm);
	}
	async *getAsm() {
		for await (const thing of this.dir.getAllInDir()) {
			if (!(thing[1] instanceof Directory)) {
				yield thing as [string, File];
			}
		}
	}
	static async new(name: string): Promise<Project> {
		const home = await Directory.home;
		const dir = await home.getDir(name);
		return new Project(name, dir);
	}
	static async checkName(name: string): Promise<false | Project> {
		const home = await Directory.home;
		for await (const [thingName, thing] of home.getAllInDir()) {
			if (thing instanceof Directory) {
				if (thingName === name) {
					return false;
				}
			}
		}
		const proj = await Project.new(name);
		await proj.createNewAsm("main.asm");
		return proj;
	}
	static async *getProjects() {
		const home = await Directory.home;
		for await (const [thingName, thing] of home.getAllInDir()) {
			if (thing instanceof Directory) {
				yield new Project(thingName, thing);
			}
		}
	}
	async getFile(str: string): Promise<File> {
		const [name, strPath] = str.split(":");
		if (name !== this.name) console.error("something bad happened, but ignoring it");
		const path = strPath.split("/").reverse();
		path.pop();
		let dir = this.dir;
		while (path.length > 1) {
			dir = await dir.getDir(path.pop() as string);
		}
		const file = await dir.getRawFile(path[0]);
		if (!file) {
			throw Error("file somehow not found");
		}
		return file;
	}
}
export {Project};

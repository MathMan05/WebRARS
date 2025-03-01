import{Directory}from"../utils/utils.js";class Project{name;dir;constructor(name,dir){this.name=name;this.dir=dir}async createNewAsm(name){await this.dir.setString(name,`.global main
.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`);return[name,`.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`]}async saveAsm(name,asm){return await this.dir.setString(name,asm)}async *getAsm(){for await(const thing of this.dir.getAllInDir()){if(!(thing[1]instanceof Directory)){yield thing}}}static async new(name){const home=await Directory.home;const dir=await home.getDir(name);return new Project(name,dir)}static async checkName(name){const home=await Directory.home;for await(const[thingName,thing]of home.getAllInDir()){if(thing instanceof Directory){if(thingName===name){return false}}}const proj=await Project.new(name);await proj.createNewAsm("main.asm");return proj}static async *getProjects(){const home=await Directory.home;for await(const[thingName,thing]of home.getAllInDir()){if(thing instanceof Directory){yield new Project(thingName,thing)}}}async getFile(str){const[name,strPath]=str.split(":");if(name!==this.name)console.error("something bad happened, but ignoring it");const path=strPath.split("/").reverse();path.pop();let dir=this.dir;while(path.length>1){dir=await dir.getDir(path.pop())}const file=await dir.getRawFile(path[0]);if(!file){throw Error("file somehow not found")}return file}async checkName(str){const[name,strPath]=str.split(":");if(name!==this.name)console.error("something bad happened, but ignoring it");const path=strPath.split("/").reverse();path.pop();let dir=this.dir;while(path.length>1){dir=await dir.getDir(path.pop())}const file=await dir.getRawFile(path[0]);console.log(!!file);return!!file}async delete(str){const[name,strPath]=str.split(":");if(name!==this.name)console.error("something bad happened, but ignoring it");const path=strPath.split("/").reverse();path.pop();let dir=this.dir;while(path.length>1){dir=await dir.getDir(path.pop())}console.log(dir);if(dir instanceof Directory){await dir.handle.removeEntry(path[0])}else{console.error("internal error, please fix me sometime :P")}}}export{Project};
//# sourceMappingURL=project.js.map
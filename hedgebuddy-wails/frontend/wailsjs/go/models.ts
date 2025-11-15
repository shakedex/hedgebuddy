export namespace storage {
	
	export class ImportSummary {
	    Added: string[];
	    Updated: string[];
	    Duplicates: string[];
	
	    static createFrom(source: any = {}) {
	        return new ImportSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Added = source["Added"];
	        this.Updated = source["Updated"];
	        this.Duplicates = source["Duplicates"];
	    }
	}

}


var dungeon = {
	stats:'max_hp.max_mp.attack.defense.special.resist.speed.evasion.accuracy'.split('.'),
	status:'poison.float.berserk.fear.stone.curse.confused.petrify'.split('.'),
	properties:'undead.flying.magical.human.ghost.beast'.split('.'),
	MAX_ATB:255,
	metaListeners:[],
	meta:{
		event:function(type,options){
			console.log(type,options);
			dungeon.metaListeners.filter(function(a){return a.type===type}).forEach(function(a){
				a(options);
			})
		},
		listen:function(type,callback){
			dungeon.metaListeners.push({type:type,callback:callback})
		}
	},
	calculate:{
		physicalDamage:function(target,damage){
			if (target.defending) damage *= 0.7;
			return damage - target.defense / 10;
		},
		specialDamage:function(target,damage){
			return damage - target.resist / 8;
		},
		level:function(entity){
			return Math.ceil(1 * Math.sqrt(entity.experience/250));
		},
		hit:function(attacker,defender,accuracy){
			var ratio = attacker.accuracy / defender.evasion;
			if (ratio > 1) {
				return true;
			}
			return Math.random() > ratio / 2;
		},
		elemental:function(target,damage,element){
			if (target.damage2x.indexOf(element) > -1) {
				damage *=2;
			}

			if (target.damage50.indexOf(element) > -1) {
				damage /= 2;
			}

			if (target.damage0.indexOf(element) > -1) {
				damage *= 0;
			}

			return damage;
		},
		atb:function(char){
			var increase = char.speed;
			if (char.haste) increase *= 2;
			if (char.slow) increase /= 2;
			return increase;
		}
	},
	actions:[],
	/*
		Add a new action that entities can do.
	*/
	action:function(name,action){
		this.actions[name] = action;
		return this;
	},
	statuses:{
		"poison":{
			beforeAction:function(stats){
				var damage = stats.max_hp*0.05;
				stats.hp-=damage;
				dungeon.meta.event("fireDamage",{target:this,damage:damage});
			}

		},
		"burn":{
			beforeAction:function(stats){
				var damage = stats.max_hp*0.1;
				if (Math.random() > 0.5) stats.hp-=damage;
				dungeon.meta.event("poisonDamage",{target:this,damage:damage});
			}
		},
		stone:{
			replaceAction:'petrified'
		},
		berserk:{
			replaceAction:'berserk_attack'
		},
	},
	status:function(name,status){
		this.statuses[name] = status;
		return this;
	},

	/*
		Creates a blueprint that returns new instances of a creature.
	*/
	entity:function(config){
		config = config || {};

		var stats = dungeon.stats;
		var stepListeners = [];
		var spawn = {
			status:{},
			experience:config.experience||1,
			hp:config.max_hp||1,
			name:config.name||'unknown',
			mp:config.max_mp||1,
			atb:0,
			dead:config.dead||false,
			team:config.team||0,
			ai:config.ai||function(){return {action:'defend'}},
			damage2x:config.damage2x||[],
			damage50:config.damage50||[],
			immune:config.immune||[],
			damage0:config.damage0||[],
			properties:config.properties||[],
			actions:config.actions || ['defend'],
			action:function(name,target){
				var action = dungeon.actions[name];
				var stats = this;
				
				for (var k in this.status) {
					if (this.status[k]) {
						var status = dungeon.statuses[k];
						if (status.replaceAction) action = dungeon.actions[status.replaceAction];
						if (status.beforeAction) status.beforeAction(this);
					}
				}

				dungeon.meta.event("action",{actor:this,name:name,target:target});
				action.bind(this)(target);
				this.atb = 0;

			},
			takeDamage:function(damage){
				this.hp-=damage;
				dungeon.meta.event("takeDamage",{target:this,damage:damage});
			},
			getCalculatedStats:function(){
				return dungeon.calculate.stats(this);
			},
			recoverHP:function(hp){
				this.hp+=hp;
				if (this.hp > this.max_hp) this.hp = this.max_hp;
				dungeon.meta.event("recoverHP",{target:this,hp:hp});

			},
			fullHeal:function(){
				this.hp = this.max_hp;
				this.mp = this.max_mp;
				this.dead = false;
				for (s in this.status) {
					this.status[s] = false;
				}
			},

			takeStatus:function(status){
				var immune = this.immune.indexOf(status) > -1;
				if (!immune) {	
					this.status[status] = true;
				}

				dungeon.meta.event("statusInflicted",{target:this,immune:immune});
			},
			step:function(){
				
				if (this.atb < dungeon.MAX_ATB) {
					this.atb+=dungeon.calculate.atb(this);
				}

				if (this.hp <= 0 && !this.dead) {
					this.dead = true;
					dungeon.meta.event("dead",{target:this});
				}

				stepListeners.forEach(function(a){a(spawn)})
			},
			onstep:function(l){
				stepListeners.push(l);
				dungeon.meta.event("step",{target:this});
			}
		}

		stats.forEach(function(s){spawn[s] = config[s] || 1});
		spawn.fullHeal();
		return spawn;
		
	}
};
var dungeon = {
    MAX_ATB: 255,
    metaListeners: [],
    filters:{
    	notDead:function(){return function(d){return !d.dead}},
        differentTeam:function(team){return function(d){return d.team !== team}},
    	sameTeam:function(team){return function(d){return d.team === team}}
    },
    meta: {
        event: function(type, options) {
            console.log(type, options);
            dungeon.metaListeners.filter(function(a) {
                return a.type === type
            }).forEach(function(a) {
                a(options);
            })
        },
        listen: function(type, callback) {
            dungeon.metaListeners.push({
                type: type,
                callback: callback
            })
        }
    },
    inventory:function(){
        var inventory = {
            add:function(item){
                this.contents.push(item);
            },
            contents:[],
            use:function(item,targets){
                console.log("using item",item,this.contents);
                var index = this.contents.indexOf(item);
                var item = this.contents[index];
                if (!item){
                    dungeon.meta.event("item_not_in_inventory");
                    return;
                };
                var instance = dungeon.items[item]();
                if (!instance.use){
                  dungeon.meta.event("cant_use_item");  
                  return;
                }

                instance.use(targets);
                this.contents.splice(index,1);
                
            },
            equip:function(item,target){

                var index = this.contents.indexOf(item);
                var item = this.contents[index];
                if (!item){
                    dungeon.meta.event("item_not_in_inventory");
                    return;
                };
                var instance = dungeon.items[item]();

                if (!instance.equip){
                  dungeon.meta.event("cant_use_equip");  
                  return;
                }
                var prev = target.equipment[instance.equip];
                if (prev){
                    this.contents.push(prev);
                }

                target.equipment[instance.equip] = item;
            }
        };
        return inventory;
    },
    items:{
        proto:{
            canEquip:false,
            canUse:false,
            onUse:function(targets){

            },
        }
    },
   item: function(name, item) {
        this.items[name] = function(){
            return item;   
        }
        return this;
    },
    battle:function(actors){
    	return {
    		step:function(){
    			actors.forEach(function(actor){
					if (actor.dead) return;
					actor.step();
					if(actor.atb>=255 && actor.auto){
						var move = dungeon.ais[actor.ai].bind(actor)(actors);

						if (move.targets.every(function(t){return t.dead})) {
							return;
						};

						actor.action(move.action,move.targets)
					}
				})
    		},
    		getTargets:function(actor,action){
                var targeting = dungeon.targetings[action];
    			return actors.filter(targeting(actor));
    		},
            action:function(entity,action,targets,all){
                if (!targets){
                    targets = this.getTargets(entity,action);
                }
                if (!all){
                    targets=targets.slice(0,1);
                }
                entity.action(action,targets);
            }
    	}
    },
    targetings:{},
    targeting: function(name, targeting) {
        this.targetings[name] = targeting;
        return this;
    },
    characters:{
        proto: function() {

        return {
            status: {},
            experience: 0,
            hp: 1,
            max_hp: 1,
            name: 'unknown',
            mp: 1,
            atb: 0,
            dead: false,
            team: 0,
            attack: 1,
            defense: 1,
            special: 1,
            resist: 1,
            evasion: 1,
            accuracy: 1,
            speed: 1,
            luck: 1,
            ai: function() {
                return {
                    action: 'defend'
                }
            },
            equipment:{},
            damage2x: [],
            damage50: [],
            immune: [],
            stepListeners: [],
            damage0: [],
            properties: [],
            actions: ['defend'],
            action: function(name, targets) {
                var action = dungeon.actions[name];
                var entity = this;

                for (var k in this.status) {
                    if (this.status[k]) {
                        var status = dungeon.statuses[k];
                        if (status.replaceAction) action = dungeon.actions[status.replaceAction];
                        if (status.beforeAction) status.beforeAction(this);
                    }
                }

                for (var q in this.equipment) {
                    if (this.equipment[q]) {
                        var equipment = dungeon.items[this.equipment[q]]();
                        if (equipment.replaceActionOn && equipment.replaceActionOn.indexOf(name)>-1) action = dungeon.actions[equipment.replaceAction];
                        if (equipment.beforeAction) equipment.beforeAction(this);
                    }
                }

                dungeon.meta.event("action", {
                    actor: this,
                    name: name,
                    targets: targets
                });

                targets.forEach(function(target){
                    action.bind(entity)(target);    
                })
                this.atb = 0;

            },
            takeDamage: function(damage) {
                this.hp -= damage;
                dungeon.meta.event("takeDamage", {
                    target: this,
                    damage: damage
                });
            },
            getCalculatedStats: function() {
                return dungeon.calculate.stats(this);
            },
            recoverHP: function(hp) {
                this.hp += hp;
                if (this.hp > this.max_hp) this.hp = this.max_hp;
                dungeon.meta.event("recoverHP", {
                    target: this,
                    hp: hp
                });

            },
            fullHeal: function() {
                this.hp = this.max_hp;
                this.mp = this.max_mp;
                this.dead = false;
                for (s in this.status) {
                    this.status[s] = false;
                }
            },

            takeStatus: function(status) {
                var immune = this.immune.indexOf(status) > -1;
                if (!immune) {
                    this.status[status] = true;
                }

                dungeon.meta.event("statusInflicted", {
                    target: this,
                    immune: immune
                });
            },
            step: function() {

                var entity = this;

                if (this.atb < dungeon.MAX_ATB) {
                    this.atb += dungeon.calculate.atb(this);
                }

                if (this.hp <= 0 && !this.dead) {
                    this.dead = true;
                    dungeon.meta.event("dead", {
                        target: this
                    });
                }

           

                this.stepListeners.forEach(function(a) {
                    a(entity)
                })
            },
            onstep: function(l) {
                this.stepListeners.push(l);
                dungeon.meta.event("step", {
                    target: this
                });
            }
        }

    }
    },
    character: function(name, schema) {
        this.characters[name] = function(overrides){
           var model = {};
           for(g in schema) {
                if (!model[g]) model[g] = schema[g];
           }
           return model; 
        } 
        return this;
    },
    ais:{},
    ai: function(name, ai) {
        this.ais[name] = ai;
        return this;
    },
    calculate: {
        physicalDamage: function(target, damage) {
            if (target.defending) damage *= 0.7;
            return damage - target.defense / 10;
        },
        specialDamage: function(target, damage) {
            return damage - target.resist / 8;
        },
        level: function(entity) {
            return Math.ceil(1 * Math.sqrt(entity.experience / 250));
        },
        hit: function(attacker, defender, accuracy) {
            var ratio = attacker.accuracy / defender.evasion;
            if (ratio > 1) {
                return true;
            }
            return Math.random() > ratio / 2;
        },
        elemental: function(target, damage, element) {
            if (target.damage2x.indexOf(element) > -1) {
                damage *= 2;
            }

            if (target.damage50.indexOf(element) > -1) {
                damage /= 2;
            }

            if (target.damage0.indexOf(element) > -1) {
                damage *= 0;
            }

            return damage;
        },
        atb: function(char) {
            var increase = char.speed;
            if (char.haste) increase *= 2;
            if (char.slow) increase /= 2;
            return increase;
        }
    },
    actions: {},
    /*
		Add a new action that entities can do.
	*/
    action: function(name, action) {
        this.actions[name] = action;
        return this;
    },
    statuses: {},
    status: function(name, status) {
        this.statuses[name] = status;
        return this;
    },

    /*
		Creates a blueprint that returns new instances of a creature.
	*/
    entity: function(config) {
        var spawn = dungeon.characters.proto();

        for (stat in config) {
            spawn[stat] = config[stat];
        }

        spawn.fullHeal();
        return spawn;

    }
};

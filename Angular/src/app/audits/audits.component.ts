import { Component, OnInit } from '@angular/core';
import { ApiService } from '../api.service';
import { ToiletObject } from '../models'
import { MatDialog, MatDialogConfig } from "@angular/material";
import { DialogComponent } from '../dialog/dialog.component';
import { MatPaginator, MatSort, MatTableDataSource } from '@angular/material';

@Component({
  selector: 'app-audits',
  templateUrl: './audits.component.html',
  styleUrls: ['./audits.component.css']
})

export class AuditsComponent implements OnInit {
  toiletObjects;
  displayedColumns = ["GPF",
    "Flushometer Brand",
    "Basin Brand",
    "ADA Stall",
    "Basin Condition ID",
    "Flushometer Condition ID",
    "Comment"];
  constructor(private apiService: ApiService, private dialog: MatDialog) { }

  openDialog() {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.disableClose = true;
    dialogConfig.autoFocus = true;
    this.dialog.open(DialogComponent, dialogConfig);
  }

  ngOnInit() {
    this.apiService.sendHttps("getAllToiletObjects")
      .subscribe((toiletObjects) => {
          this.toiletObjects = toiletObjects;
        });
  }
}